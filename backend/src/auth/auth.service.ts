import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  CognitoIdentityProviderClient, InitiateAuthCommand, NotAuthorizedException, UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { Repository } from 'typeorm';
import { RolUsuario } from '../catalogos/catalogo.entities';
import { Usuario } from './usuario.entity';
import { LoginDto, LoginRespuestaDto } from './auth.dto';
import { GRUPO_A_ROL, GRUPOS_PERSONAL } from './roles';

/**
 * Login de personal SIPINNA contra Cognito (la API nunca guarda contraseñas).
 * Cognito aplica la política de contraseñas, la protección contra fuerza bruta y el MFA.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly cognito = new CognitoIdentityProviderClient({});
  private readonly verificadorId = CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID ?? '',
    clientId: process.env.COGNITO_CLIENT_ID ?? '',
    tokenUse: 'id',
  });

  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(RolUsuario) private readonly roles: Repository<RolUsuario>,
  ) {}

  async login({ correo, password }: LoginDto): Promise<LoginRespuestaDto> {
    let accessToken: string | undefined;
    let idToken: string | undefined;
    let expiresIn = 3600;
    try {
      const r = await this.cognito.send(new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: process.env.COGNITO_CLIENT_ID,
        AuthParameters: { USERNAME: correo.toLowerCase(), PASSWORD: password },
      }));
      if (r.ChallengeName) {
        // NEW_PASSWORD_REQUIRED / MFA: la app aún no implementa estos retos.
        this.logger.warn(`Reto de Cognito no soportado: ${r.ChallengeName}`);
        throw new UnauthorizedException('Se requiere completar un paso adicional de autenticación');
      }
      accessToken = r.AuthenticationResult?.AccessToken;
      idToken = r.AuthenticationResult?.IdToken;
      expiresIn = r.AuthenticationResult?.ExpiresIn ?? expiresIn;
    } catch (e) {
      if (e instanceof NotAuthorizedException || e instanceof UserNotFoundException) {
        throw new UnauthorizedException('Credenciales inválidas');
      }
      throw e;
    }
    if (!accessToken || !idToken) throw new UnauthorizedException();

    const claims = await this.verificadorId.verify(idToken);
    const grupos = claims['cognito:groups'] ?? [];
    const usuario = await this.sincronizarUsuario(claims.sub, String(claims.email).toLowerCase(), grupos);

    return {
      idUsuario: usuario.id,
      correo: usuario.correo,
      rol: usuario.rol.nombre,
      esAdministrador: grupos.some((g) => GRUPOS_PERSONAL.includes(g)),
      accessToken,
      expiresIn,
    };
  }

  /** Crea o actualiza la fila `usuario` a partir de la identidad de Cognito. */
  private async sincronizarUsuario(sub: string, correo: string, grupos: string[]): Promise<Usuario> {
    const nombreRol = grupos.includes('Administrador') ? GRUPO_A_ROL.Administrador
      : grupos.includes('PersonalSIPINNA') ? GRUPO_A_ROL.PersonalSIPINNA : 'Ciudadano';
    const rol = await this.roles.findOneByOrFail({ nombre: nombreRol });

    // Por correo también: si la cuenta se recreó en Cognito, llega con otro `sub`.
    // Seguro porque el pool solo admite altas por administrador y correos verificados.
    const existente = (await this.usuarios.findOneBy({ cognitoSub: sub }))
      ?? (await this.usuarios.findOneBy({ correo }));
    if (existente) {
      existente.cognitoSub = sub;
      existente.correo = correo;
      existente.rol = rol;
      return this.usuarios.save(existente);
    }
    return this.usuarios.save(this.usuarios.create({ cognitoSub: sub, correo, rol }));
  }

  /** Busca el usuario local por `sub` (para registrar quién hace cada seguimiento). */
  buscarPorSub(sub: string): Promise<Usuario | null> {
    return this.usuarios.findOneBy({ cognitoSub: sub });
  }
}
