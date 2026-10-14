import {
  ChangePasswordCommand, CognitoIdentityProviderClient, ConfirmForgotPasswordCommand, ConfirmSignUpCommand,
  DeleteUserCommand, ForgotPasswordCommand, GetUserCommand, GlobalSignOutCommand, InitiateAuthCommand,
  ResendConfirmationCodeCommand, SignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider';

/** Tokens que entrega el inicio de sesión de un ciudadano. */
export interface TokensCiudadano {
  accessToken: string;
  /** Solo en el inicio de sesión (al refrescar no cambia). */
  refreshToken?: string;
  expiresIn: number;
}

/** Fallas esperables de Cognito, traducidas a códigos propios. */
export type CodigoErrorCuenta =
  | 'YA_EXISTE' | 'CODIGO_INVALIDO' | 'CODIGO_VENCIDO' | 'CREDENCIALES' | 'NO_CONFIRMADA'
  | 'CONTRASENA_DEBIL' | 'DEMASIADOS_INTENTOS';

/** Error de cuenta con un código estable. */
export class ErrorCuenta extends Error {
  constructor(readonly codigo: CodigoErrorCuenta) {
    super(codigo);
  }
}

/**
 * Operaciones de cuenta de ciudadano. Detrás de esta interfaz para que las
 * pruebas usen un doble y nunca hablen con Cognito.
 */
export interface ProveedorCuentas {
  registrar(correo: string, password: string): Promise<void>;
  confirmar(correo: string, codigo: string): Promise<void>;
  reenviarCodigo(correo: string): Promise<void>;
  iniciarSesion(correo: string, password: string): Promise<TokensCiudadano>;
  refrescar(refreshToken: string): Promise<TokensCiudadano>;
  olvideContrasena(correo: string): Promise<void>;
  restablecerContrasena(correo: string, codigo: string, password: string): Promise<void>;
  cambiarContrasena(accessToken: string, actual: string, nueva: string): Promise<void>;
  cerrarSesionGlobal(accessToken: string): Promise<void>;
  eliminar(accessToken: string): Promise<void>;
  correo(accessToken: string): Promise<string>;
}

/** Token de inyección del proveedor de cuentas. */
export const PROVEEDOR_CUENTAS = Symbol('PROVEEDOR_CUENTAS');

/** Errores de Cognito → código propio (los demás se propagan como error interno). */
const TRADUCCION: Record<string, CodigoErrorCuenta> = {
  UsernameExistsException: 'YA_EXISTE',
  CodeMismatchException: 'CODIGO_INVALIDO',
  ExpiredCodeException: 'CODIGO_VENCIDO',
  NotAuthorizedException: 'CREDENCIALES',
  UserNotFoundException: 'CREDENCIALES',
  UserNotConfirmedException: 'NO_CONFIRMADA',
  InvalidPasswordException: 'CONTRASENA_DEBIL',
  LimitExceededException: 'DEMASIADOS_INTENTOS',
  TooManyRequestsException: 'DEMASIADOS_INTENTOS',
  TooManyFailedAttemptsException: 'DEMASIADOS_INTENTOS',
};

/**
 * Proveedor real: el pool de ciudadanos de Cognito, con el cliente público del
 * API (sin secret). Las APIs de autoservicio de Cognito no requieren permisos IAM.
 */
export class CuentasCognito implements ProveedorCuentas {
  private readonly cognito = new CognitoIdentityProviderClient({});
  private readonly cliente = process.env.COGNITO_CIUDADANOS_CLIENT_ID ?? '';

  private async llamar<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const codigo = TRADUCCION[(e as { name?: string }).name ?? ''];
      if (codigo) throw new ErrorCuenta(codigo);
      throw e;
    }
  }

  async registrar(correo: string, password: string): Promise<void> {
    await this.llamar(() => this.cognito.send(new SignUpCommand({
      ClientId: this.cliente, Username: correo, Password: password, UserAttributes: [{ Name: 'email', Value: correo }],
    })));
  }

  async confirmar(correo: string, codigo: string): Promise<void> {
    await this.llamar(() => this.cognito.send(new ConfirmSignUpCommand({ ClientId: this.cliente, Username: correo, ConfirmationCode: codigo })));
  }

  async reenviarCodigo(correo: string): Promise<void> {
    await this.llamar(() => this.cognito.send(new ResendConfirmationCodeCommand({ ClientId: this.cliente, Username: correo })));
  }

  async iniciarSesion(correo: string, password: string): Promise<TokensCiudadano> {
    const r = await this.llamar(() => this.cognito.send(new InitiateAuthCommand({
      ClientId: this.cliente, AuthFlow: 'USER_PASSWORD_AUTH', AuthParameters: { USERNAME: correo, PASSWORD: password },
    })));
    const a = r.AuthenticationResult;
    if (!a?.AccessToken) throw new ErrorCuenta('CREDENCIALES');
    return { accessToken: a.AccessToken, refreshToken: a.RefreshToken, expiresIn: a.ExpiresIn ?? 3600 };
  }

  async refrescar(refreshToken: string): Promise<TokensCiudadano> {
    const r = await this.llamar(() => this.cognito.send(new InitiateAuthCommand({
      ClientId: this.cliente, AuthFlow: 'REFRESH_TOKEN_AUTH', AuthParameters: { REFRESH_TOKEN: refreshToken },
    })));
    const a = r.AuthenticationResult;
    if (!a?.AccessToken) throw new ErrorCuenta('CREDENCIALES');
    return { accessToken: a.AccessToken, expiresIn: a.ExpiresIn ?? 3600 };
  }

  async olvideContrasena(correo: string): Promise<void> {
    await this.llamar(() => this.cognito.send(new ForgotPasswordCommand({ ClientId: this.cliente, Username: correo })));
  }

  async restablecerContrasena(correo: string, codigo: string, password: string): Promise<void> {
    await this.llamar(() => this.cognito.send(new ConfirmForgotPasswordCommand({
      ClientId: this.cliente, Username: correo, ConfirmationCode: codigo, Password: password,
    })));
  }

  async cambiarContrasena(accessToken: string, actual: string, nueva: string): Promise<void> {
    await this.llamar(() => this.cognito.send(new ChangePasswordCommand({ AccessToken: accessToken, PreviousPassword: actual, ProposedPassword: nueva })));
  }

  async cerrarSesionGlobal(accessToken: string): Promise<void> {
    await this.llamar(() => this.cognito.send(new GlobalSignOutCommand({ AccessToken: accessToken })));
  }

  async eliminar(accessToken: string): Promise<void> {
    await this.llamar(() => this.cognito.send(new DeleteUserCommand({ AccessToken: accessToken })));
  }

  async correo(accessToken: string): Promise<string> {
    const r = await this.llamar(() => this.cognito.send(new GetUserCommand({ AccessToken: accessToken })));
    return r.UserAttributes?.find((a) => a.Name === 'email')?.Value ?? '';
  }
}
