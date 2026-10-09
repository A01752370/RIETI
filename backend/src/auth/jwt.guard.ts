import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { Request } from 'express';
import { AUTH_OPCIONAL_KEY, ROLES_KEY } from './roles';
import { UsuarioAutenticado } from './auth.dto';

/**
 * Valida el access token de Cognito (firma con JWKS, emisor, client_id y expiración)
 * y aplica RBAC por grupos (RNF-18). Solo actúa en rutas con `@Roles` o `@AuthOpcional`.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  private readonly verificador = CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID ?? '',
    clientId: process.env.COGNITO_CLIENT_ID ?? '',
    tokenUse: 'access',
  });

  constructor(private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    const roles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, objetivos);
    const opcional = this.reflector.getAllAndOverride<boolean | undefined>(AUTH_OPCIONAL_KEY, objetivos);
    if (!roles && !opcional) return true;

    const req = ctx.switchToHttp().getRequest<Request & { usuario?: UsuarioAutenticado }>();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) {
      if (opcional) return true;
      throw new UnauthorizedException();
    }

    let usuario: UsuarioAutenticado;
    try {
      const payload = await this.verificador.verify(token);
      usuario = { sub: payload.sub, grupos: payload['cognito:groups'] ?? [] };
    } catch {
      throw new UnauthorizedException();
    }
    req.usuario = usuario;

    if (roles && !usuario.grupos.some((g) => roles.includes(g))) throw new ForbiddenException();
    return true;
  }
}
