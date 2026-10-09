import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { PUBLICO_KEY, ROLES_KEY } from './roles';
import { UsuarioAutenticado } from './auth.dto';

/** Lo mínimo que el guard necesita de un verificador de access tokens. */
export interface VerificadorJwt {
  /** Verifica el token y devuelve sus claims; lanza si es inválido. */
  verify(token: string): Promise<{ sub: string; 'cognito:groups'?: string[] }>;
}

/** Token de inyección del verificador (en pruebas se sustituye por un doble). */
export const VERIFICADOR_JWT = Symbol('VERIFICADOR_JWT');

/** Verificador real: access tokens del pool de Cognito configurado. */
export function crearVerificadorCognito(): VerificadorJwt {
  return CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID ?? '',
    clientId: process.env.COGNITO_CLIENT_ID ?? '',
    tokenUse: 'access',
  }) as unknown as VerificadorJwt;
}

/** Petición de Express con el usuario que deja el guard. */
export type RequestAutenticado = Request & { usuario?: UsuarioAutenticado };

/**
 * Guard global de autenticación y autorización (RNF-18, ataques A2, A4 y A11).
 *
 * - **Deniega por defecto:** toda ruta exige un access token de Cognito, salvo
 *   las marcadas con `@Publico()`.
 * - Valida firma (JWKS), emisor, `client_id`, `token_use=access` y expiración
 *   con `aws-jwt-verify`; un token alterado, de otro pool o con `alg:none` se rechaza.
 * - Aplica RBAC por grupos de Cognito cuando la ruta tiene `@Roles(...)`.
 * - Exige que el usuario exista en la tabla `usuario` y esté activo, para que
 *   desactivar a alguien surta efecto sin esperar a que caduque su token.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    @Inject(VERIFICADOR_JWT) private readonly verificador: VerificadorJwt,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(PUBLICO_KEY, objetivos)) return true;
    const roles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, objetivos);

    const req = ctx.switchToHttp().getRequest<RequestAutenticado>();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException();

    let sub: string;
    let grupos: string[];
    try {
      const payload = await this.verificador.verify(token);
      sub = payload.sub;
      grupos = payload['cognito:groups'] ?? [];
    } catch {
      throw new UnauthorizedException();
    }

    if (roles && !grupos.some((g) => roles.includes(g))) throw new ForbiddenException();

    const usuario = await this.auth.buscarPorSub(sub);
    if (!usuario?.activo) {
      throw new ForbiddenException({ codigo: 'USUARIO_INACTIVO', mensaje: 'Tu cuenta no está activa en RIETI' });
    }
    req.usuario = { sub, grupos, idUsuario: usuario.id };
    return true;
  }
}
