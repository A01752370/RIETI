import { applyDecorators, SetMetadata } from '@nestjs/common';

/** Grupos de Cognito → nombre del rol en la tabla `rol_usuario`. */
export const GRUPO_A_ROL: Record<string, string> = {
  Administrador: 'Administrador',
  CoordinadorRegional: 'Coordinador regional',
  PersonalSIPINNA: 'Personal SIPINNA',
};

/**
 * Grupos que ven **todos** los municipios participantes (Fase 7). El resto del personal
 * (enlace municipal) solo ve los municipios que tiene asignados en `asignacion_municipio`.
 */
export const GRUPOS_REGIONALES = ['Administrador', 'CoordinadorRegional'];

/** Grupos de Cognito que corresponden a personal SIPINNA. */
export const GRUPOS_PERSONAL = Object.keys(GRUPO_A_ROL);

/**
 * Nombre del perfil que ve la persona (D-18, Fase 7): el grupo `PersonalSIPINNA` es el
 * "Enlace municipal" (solo sus municipios) y `CoordinadorRegional` ve todos los municipios.
 */
export const GRUPO_A_PERFIL: Record<string, string> = {
  Administrador: 'Administrador',
  CoordinadorRegional: 'Coordinador regional',
  PersonalSIPINNA: 'Enlace municipal',
};

/** Acciones protegidas del API. */
export type Permiso =
  | 'reportes.ver'
  | 'reportes.gestionar'
  | 'reportes.exportar'
  | 'estadisticas.ver'
  | 'red.editar'
  | 'perfil.ver'
  | 'expediente.editar'
  | 'alertas.ver'
  | 'alertas.gestionar'
  | 'personal.administrar'
  | 'configuracion.editar'
  | 'accesos.ver'
  | 'reportes.registrar'
  | 'base.exportar';

/**
 * Matriz de permisos (D-18): qué grupos de Cognito pueden ejecutar cada acción.
 * Es la **única fuente de verdad**: las rutas la aplican con {@link Requiere}
 * y `test/rutas-protegidas.spec.ts` verifica que cada ruta use el permiso esperado.
 */
export const MATRIZ_PERMISOS: Readonly<Record<Permiso, readonly string[]>> = {
  'reportes.ver': ['Administrador', 'CoordinadorRegional', 'PersonalSIPINNA'],
  'reportes.gestionar': ['Administrador', 'CoordinadorRegional', 'PersonalSIPINNA'],
  'reportes.exportar': ['Administrador', 'CoordinadorRegional', 'PersonalSIPINNA'],
  'estadisticas.ver': ['Administrador', 'CoordinadorRegional', 'PersonalSIPINNA'],
  'red.editar': ['Administrador'],
  'perfil.ver': ['Administrador', 'CoordinadorRegional', 'PersonalSIPINNA'],
  'expediente.editar': ['Administrador', 'CoordinadorRegional', 'PersonalSIPINNA'],
  'alertas.ver': ['Administrador', 'CoordinadorRegional', 'PersonalSIPINNA'],
  'alertas.gestionar': ['Administrador', 'CoordinadorRegional', 'PersonalSIPINNA'],
  'personal.administrar': ['Administrador'],
  'configuracion.editar': ['Administrador'],
  'accesos.ver': ['Administrador'],
  'reportes.registrar': ['Administrador', 'CoordinadorRegional', 'PersonalSIPINNA'],
  'base.exportar': ['Administrador', 'CoordinadorRegional'],
};

/** Descripción en español de cada permiso, para mostrarla en la web del personal. */
export const DESCRIPCION_PERMISO: Readonly<Record<Permiso, string>> = {
  'reportes.ver': 'Ver la bandeja y el detalle de los reportes',
  'reportes.gestionar': 'Cambiar el estatus de un reporte y agregar notas de seguimiento',
  'reportes.exportar': 'Descargar la bandeja filtrada en CSV (sin descripciones ni coordenadas)',
  'estadisticas.ver': 'Ver el panel de estadísticas (solo datos agregados)',
  'red.editar': 'Editar los contactos del directorio de la red de municipios',
  'perfil.ver': 'Ver su propio perfil y permisos',
  'expediente.editar': 'Editar el expediente (responsable, dependencia, verificación, seguimiento, duplicados y acciones)',
  'alertas.ver': 'Ver las alertas de punto recurrente de sus municipios',
  'alertas.gestionar': 'Marcar alertas de punto recurrente como atendidas',
  'personal.administrar': 'Asignar municipios a cada persona del personal',
  'configuracion.editar': 'Editar los parámetros de duplicados, alertas y conservación',
  'accesos.ver': 'Consultar la bitácora de accesos a expedientes',
  'reportes.registrar': 'Registrar reportes institucionales (detección en recorridos) en sus municipios',
  'base.exportar': 'Descargar la base regional anonimizada (celdas de ≈ 110 m, solo conteos)',
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
 * exigen JWT: hacer pública una ruta es una decisión explícita (docs/GUIA-DESARROLLO.md, regla 6).
 */
export const Publico = () => SetMetadata(PUBLICO_KEY, true);

/** Clave de metadatos de {@link Ciudadano} y {@link CiudadanoOpcional}. */
export const CIUDADANO_KEY = 'ciudadano';

/**
 * Ruta de cuenta de ciudadano (Fase 4): exige un access token del pool de
 * **ciudadanos**. Un token del personal no sirve aquí, ni uno de ciudadano en
 * rutas del personal (cada pool tiene su propio verificador).
 */
export const Ciudadano = () => SetMetadata(CIUDADANO_KEY, 'requerido');

/**
 * Ruta pública que acepta, opcionalmente, un token de ciudadano (p. ej. para
 * vincular un reporte). Sin token sigue siendo anónima; con un token inválido responde 401.
 */
export const CiudadanoOpcional = () => SetMetadata(CIUDADANO_KEY, 'opcional');
