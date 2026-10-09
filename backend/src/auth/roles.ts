import { SetMetadata } from '@nestjs/common';

/** Grupos de Cognito → nombre del rol en la tabla `rol_usuario`. */
export const GRUPO_A_ROL: Record<string, string> = {
  Administrador: 'Administrador',
  PersonalSIPINNA: 'Personal SIPINNA',
};

/** Grupos de Cognito que corresponden a personal SIPINNA (acceso a la bandeja). */
export const GRUPOS_PERSONAL = Object.keys(GRUPO_A_ROL);

/** Clave de metadatos de {@link Roles}. */
export const ROLES_KEY = 'roles';

/**
 * Restringe una ruta a ciertos grupos de Cognito.
 * Sin este decorador (y sin {@link Publico}) la ruta solo exige un JWT válido.
 */
export const Roles = (...grupos: string[]) => SetMetadata(ROLES_KEY, grupos);

/** Clave de metadatos de {@link Publico}. */
export const PUBLICO_KEY = 'publico';

/**
 * Marca una ruta como pública (sin sesión). Por defecto **todas** las rutas
 * exigen JWT: hacer pública una ruta es una decisión explícita (CLAUDE.md, regla 6).
 */
export const Publico = () => SetMetadata(PUBLICO_KEY, true);
