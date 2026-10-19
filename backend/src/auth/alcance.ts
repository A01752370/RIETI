import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { UsuarioAutenticado } from './auth.dto';
import { GRUPOS_REGIONALES } from './roles';

/**
 * Alcance territorial de una persona del personal (Fase 7, A3).
 *
 * @property idUsuario `usuario.id_usuario`
 * @property municipios `null` = todos los municipios (Administrador y Coordinador regional);
 *   si no, solo los asignados en `asignacion_municipio` (enlace municipal). Una lista vacía
 *   no ve nada: se niega por defecto.
 */
export interface Alcance {
  idUsuario: number;
  municipios: number[] | null;
}

/** Calcula el alcance a partir de los grupos de Cognito y las asignaciones en la base. */
export async function alcanceDe(ds: DataSource | EntityManager, u: UsuarioAutenticado): Promise<Alcance> {
  if (u.grupos.some((g) => GRUPOS_REGIONALES.includes(g))) return { idUsuario: u.idUsuario, municipios: null };
  const filas: { id_municipio: number }[] = await ds.query(
    'SELECT id_municipio FROM asignacion_municipio WHERE id_usuario = $1 ORDER BY id_municipio', [u.idUsuario]);
  return { idUsuario: u.idUsuario, municipios: filas.map((f) => Number(f.id_municipio)) };
}

/**
 * ¿La persona puede ver un reporte de este municipio? Los reportes sin municipio (anteriores
 * al selector, D-16) solo los ven los perfiles regionales.
 */
export function puedeVer(a: Alcance, idMunicipio: number | null | undefined): boolean {
  if (a.municipios === null) return true;
  return idMunicipio !== null && idMunicipio !== undefined && a.municipios.includes(Number(idMunicipio));
}

/**
 * Lanza el mismo 404 uniforme que un reporte inexistente: un enlace municipal no
 * puede distinguir "no existe" de "es de otro municipio".
 */
export function exigirAlcance(a: Alcance, idMunicipio: number | null | undefined): void {
  if (!puedeVer(a, idMunicipio)) throw new NotFoundException('Reporte no encontrado');
}

/** Parámetro SQL del alcance: `null` (sin filtro) o el arreglo de municipios. Usar con `($n::int[] IS NULL OR r.id_municipio = ANY($n::int[]))`. */
export function parametroAlcance(a: Alcance): number[] | null {
  return a.municipios;
}

/** Acción registrada en la bitácora de accesos. */
export type AccionAcceso = 'ver' | 'exportar' | 'foto';

/**
 * Registra en la bitácora de accesos (append-only) quién consultó qué expediente y cuándo.
 *
 * @param detalle texto corto sin datos personales (p. ej. los filtros de una exportación)
 */
export async function registrarAcceso(
  ds: DataSource | EntityManager, idUsuario: number, accion: AccionAcceso,
  reporte: { id: number; folio: string } | null, detalle: string | null = null,
): Promise<void> {
  await ds.query(
    'INSERT INTO acceso_expediente (id_usuario, id_reporte, folio, accion, detalle) VALUES ($1, $2, $3, $4, $5)',
    [idUsuario, reporte?.id ?? null, reporte?.folio ?? null, accion, detalle?.slice(0, 300) ?? null]);
}
