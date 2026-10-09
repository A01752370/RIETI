import { SetMetadata } from '@nestjs/common';

/** Grupos de Cognito → nombre del rol en la tabla `rol_usuario`. */
export const GRUPO_A_ROL: Record<string, string> = {
  Administrador: 'Administrador',
  PersonalSIPINNA: 'Personal SIPINNA',
};
export const GRUPOS_PERSONAL = Object.keys(GRUPO_A_ROL);

export const ROLES_KEY = 'roles';
/** Restringe una ruta a ciertos grupos de Cognito. */
export const Roles = (...grupos: string[]) => SetMetadata(ROLES_KEY, grupos);

export const AUTH_OPCIONAL_KEY = 'authOpcional';
/** La ruta acepta peticiones anónimas, pero si trae un JWT válido se identifica al usuario. */
export const AuthOpcional = () => SetMetadata(AUTH_OPCIONAL_KEY, true);
