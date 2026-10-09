import 'reflect-metadata';
import { DataSource, EntityManager } from 'typeorm';
import { opcionesTypeOrm } from '../config/typeorm.config';

/**
 * Herramienta de ADMINISTRACIÓN (no es una ruta del API): borra un reporte y
 * todo lo que cuelga de él (folio, caso, bitácora, ubicación).
 *
 * Existe solo para retirar reportes de prueba antes de la demo
 * (`RIETI-2026-000001`). La bitácora `seguimiento` es solo de inserción, así
 * que el trigger se desactiva y se reactiva **dentro de la misma transacción**:
 * ninguna otra sesión llega a ver la tabla sin protección, y si algo falla el
 * ROLLBACK deja todo como estaba. Requiere ser dueño de la tabla (usuario maestro).
 *
 * Uso (como tarea única de ECS; ver docs/RUNBOOK-AWS.md):
 *   node dist/scripts/borrar-reporte.js RIETI-2026-000001 --confirmar
 */

/** Resumen de lo borrado (sin datos del reporte). */
export interface ResultadoBorrado {
  folio: string;
  casos: number;
  seguimientos: number;
}

/**
 * Borra el reporte con el folio indicado dentro de la transacción `m`.
 * Los casos compartidos con otros reportes se conservan.
 * @throws Error si el folio no existe
 */
export async function borrarReportePorFolio(m: EntityManager, folio: string): Promise<ResultadoBorrado> {
  const filas: { id_reporte: number; id_ubicacion: number }[] = await m.query(
    `SELECT r.id_reporte, r.id_ubicacion FROM folio f JOIN reporte r ON r.id_reporte = f.id_reporte
     WHERE f.codigo = $1 FOR UPDATE OF r`, [folio]);
  if (filas.length === 0) throw new Error(`No existe el folio ${folio}`);
  const { id_reporte: idReporte, id_ubicacion: idUbicacion } = filas[0];

  // Casos que solo pertenecen a este reporte.
  const casos: { id_caso: number }[] = await m.query(
    `SELECT rc.id_caso FROM reporte_caso rc WHERE rc.id_reporte = $1
     AND NOT EXISTS (SELECT 1 FROM reporte_caso o WHERE o.id_caso = rc.id_caso AND o.id_reporte <> $1)`, [idReporte]);
  const idsCaso = casos.map((c) => c.id_caso);

  await m.query('ALTER TABLE seguimiento DISABLE TRIGGER tr_seguimiento_inmutable');
  const [, seguimientos] = await m.query('DELETE FROM seguimiento WHERE id_caso = ANY($1::int[])', [idsCaso]);
  await m.query('ALTER TABLE seguimiento ENABLE TRIGGER tr_seguimiento_inmutable');

  await m.query('DELETE FROM reporte_caso WHERE id_reporte = $1', [idReporte]);
  await m.query('DELETE FROM caso WHERE id_caso = ANY($1::int[])', [idsCaso]);
  await m.query('DELETE FROM folio WHERE id_reporte = $1', [idReporte]);
  await m.query('DELETE FROM reporte WHERE id_reporte = $1', [idReporte]);
  await m.query('DELETE FROM ubicacion WHERE id_ubicacion = $1', [idUbicacion]);

  return { folio, casos: idsCaso.length, seguimientos: Number(seguimientos) || 0 };
}

async function main(): Promise<void> {
  const [folio, confirmar] = process.argv.slice(2);
  if (!/^RIETI-\d{4}-\d{6}$/.test(folio ?? '') || confirmar !== '--confirmar') {
    console.error('Uso: node dist/scripts/borrar-reporte.js RIETI-AAAA-NNNNNN --confirmar');
    process.exit(2);
  }
  const ds = await new DataSource({ ...opcionesTypeOrm(), migrationsRun: false }).initialize();
  try {
    const r = await ds.transaction((m) => borrarReportePorFolio(m, folio));
    console.log(`Borrado ${r.folio}: ${r.casos} caso(s), ${r.seguimientos} evento(s) de bitácora.`);
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  main().catch((e: Error) => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
}
