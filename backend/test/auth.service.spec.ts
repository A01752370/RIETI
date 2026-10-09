import { CognitoIdentityProviderClient, NotAuthorizedException } from '@aws-sdk/client-cognito-identity-provider';
import { HttpException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service';

/** Login contra Cognito con el cliente del SDK simulado (sin red). */
describe('AuthService.login', () => {
  let servicio: AuthService;
  const send = jest.spyOn(CognitoIdentityProviderClient.prototype, 'send');

  beforeAll(() => {
    process.env.COGNITO_USER_POOL_ID = 'mx-central-1_PRUEBA';
    process.env.COGNITO_CLIENT_ID = 'cliente-prueba';
    servicio = new AuthService({} as never, {} as never);
  });
  afterAll(() => send.mockRestore());

  /** Ejecuta el login y devuelve el estatus y cuerpo del error. */
  async function errorDe(): Promise<{ estatus: number; cuerpo: unknown }> {
    try {
      await servicio.login({ correo: 'Enlace@Ejemplo.mx', password: 'una-contraseña-larga' });
    } catch (e) {
      const h = e as HttpException;
      return { estatus: h.getStatus(), cuerpo: h.getResponse() };
    }
    throw new Error('se esperaba un error');
  }

  it('contraseña incorrecta → 401 CREDENCIALES_INVALIDAS (no "sesión expirada")', async () => {
    send.mockRejectedValueOnce(new NotAuthorizedException({ message: 'Incorrect username or password.', $metadata: {} }) as never);
    expect(await errorDe()).toEqual({
      estatus: 401, cuerpo: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos' },
    });
  });

  it('reto de Cognito (cambio de contraseña o MFA) → 401 RETO_NO_SOPORTADO', async () => {
    send.mockResolvedValueOnce({ ChallengeName: 'NEW_PASSWORD_REQUIRED', $metadata: {} } as never);
    const { estatus, cuerpo } = await errorDe();
    expect(estatus).toBe(401);
    expect(cuerpo).toMatchObject({ codigo: 'RETO_NO_SOPORTADO' });
  });

  it('envía el correo en minúsculas y nunca registra la contraseña', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    send.mockRejectedValueOnce(new NotAuthorizedException({ message: 'x', $metadata: {} }) as never);
    await errorDe();
    const comando = send.mock.calls.at(-1)![0] as unknown as { input: { AuthParameters: Record<string, string> } };
    expect(comando.input.AuthParameters.USERNAME).toBe('enlace@ejemplo.mx');
    expect(JSON.stringify(log.mock.calls)).not.toContain('una-contraseña-larga');
    log.mockRestore();
  });
});
