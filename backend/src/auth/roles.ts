import { applyDecorators, SetMetadata } from '@nestjs/common';

/** Grupos de Cognito → nombre del rol en la tabla `rol_usuario`. */
export const GRUPO_A_ROL: Record<string, string> = {
  Administrador: 'Administrador',
  PersonalSIPINNA: 'Personal SIPINNA',
};

/** Grupos de Cognito que corresponden a personal SIPINNA. */
export const GRUPOS_PERSONAL = Object.keys(GRUPO_A_ROL);

/**
 * Nombre del perfil que ve la persona (D-18). Hoy el grupo `PersonalSIPINNA`
 * corresponde al perfil "Enlace municipal"; "Coordinador" está planeado y no
 * tiene grupo en Cognito (ver docs/seguridad/roles-y-permisos.md).
 */
export const GRUPO_A_PERFIL: Record<string, string> = {
  Administrador: 'Administrador',
  PersonalSIPINNA: 'Enlace municipal',
};

/** Acciones protegidas del API. */
export type Permiso =
  | 'reportes.ver'
  | 'reportes.gestionar'
  | 'estadisticas.ver'
  | 'red.editar'
  | 'perfil.ver';

/**
 * Matriz de permisos (D-18): qué grupos de Cognito pueden ejecutar cada acción.
 * Es la **única fuente de verdad**: las rutas la aplican con {@link Requiere}
 * y `test/rutas-protegidas.spec.ts` verifica que cada ruta use el permiso esperado.
 */
export const MATRIZ_PERMISOS: Readonly<Record<Permiso, readonly string[]>> = {
  'reportes.ver': ['Administrador', 'PersonalSIPINNA'],
  'reportes.gestionar': ['Administrador', 'PersonalSIPINNA'],
  'estadisticas.ver': ['Administrador', 'PersonalSIPINNA'],
  'red.editar': ['Administrador'],
  'perfil.ver': ['Administrador', 'PersonalSIPINNA'],
};

/** Descripción en español de cada permiso, para mostrarla en la web del personal. */
export const DESCRIPCION_PERMISO: Readonly<Record<Permiso, string>> = {
  'reportes.ver': 'Ver la bandeja y el detalle de los reportes',
  'reportes.gestionar': 'Cambiar el estatus de un reporte y agregar notas de seguimiento',
  'estadisticas.ver': 'Ver el panel de estadísticas (solo datos agregados)',
  'red.editar': 'Editar los contactos del directorio de la red de municipios',
  'perfil.ver': 'Ver su propio perfil y permisos',
};

/** Permisos que otorgan los grupos indicados. */
export function permisosDe(grupos: readonly string[]): Permiso[] {
  return (Object.keys(MATRIZ_PERMISOS) as Permiso[]).filter((p) => MATRIZ_PERMISOS[p].some((g) => grupos.includes(g)));
}

/** Clave de metadatos de {@link Roles}. */
export const ROLES_KEY = 'roles';

/** Restringe una ruta a ciertos grupos de Cognito (usar {@link Requiere} en rutas nuevas). */
export const Roles = (...grupos: string[]) => SetMetadata(ROLES_KEY, grupos);

/** Clave de metadatos del permiso declarado por {@link Requiere}. */
export const PERMISO_KEY = 'permiso';

/** Exige un permiso de la matriz: aplica los grupos que lo tienen y deja constancia del permiso. */
export const Requiere = (permiso: Permiso) =>
  applyDecorators(SetMetadata(PERMISO_KEY, permiso), Roles(...MATRIZ_PERMISOS[permiso]));

/** Clave de metadatos de {@link Publico}. */
export const PUBLICO_KEY = 'publico';

/**
 * Marca una ruta como pública (sin sesión). Por defecto **todas** las rutas
 * exigen JWT: hacer pública una ruta es una decisión explícita (CLAUDE.md, regla 6).
 */
export const Publico = () => SetMetadata(PUBLICO_KEY, true);
