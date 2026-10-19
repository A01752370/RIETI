import 'reflect-metadata';
import { DataSource, EntityManager } from 'typeorm';
import { opcionesTypeOrm } from '../config/typeorm.config';

/**
 * Herramienta de ADMINISTRACIÓN (no es una ruta del API): aplica la política de
 * conservación de la bitácora de accesos (Fase 7, D-40). Borra las entradas más
 * antiguas que `accesos_conservacion_dias` (parámetro editable por el Administrador).
 *
 * `acceso_expediente` es solo de inserción: el trigger se desactiva y se reactiva
 * **dentro de la misma transacción**, como en `borrar-reporte.ts`. Requiere ser
 * dueño de la tabla (usuario maestro).
 *
 * Uso (como tarea única de ECS; ver docs/RUNBOOK-AWS.md):
 *   node dist/scripts/depurar-accesos.js --confirmar
 */

/**
 * Borra los accesos más antiguos que la conservación configurada.
 * @returns días de conservación aplicados y filas borradas
 */
export async function depurarAccesos(m: EntityManager): Promise<{ dias: number; borradas: number }> {
  const [fila] = await m.query("SELECT valor FROM configuracion WHERE clave = 'accesos_conservacion_dias'");
  // Nunca menos de 90 días aunque alguien altere la tabla a mano.
  const dias = Math.max(90, Number(fila?.valor ?? 365));
  await m.query('ALTER TABLE acceso_expediente DISABLE TRIGGER tr_acceso_expediente_solo_insercion');
  const [, borradas] = await m.query('DELETE FROM acceso_expediente WHERE fecha < now() - make_interval(days => $1::int)', [dias]);
  await m.query('ALTER TABLE acceso_expediente ENABLE TRIGGER tr_acceso_expediente_solo_insercion');
  return { dias, borradas: Number(borradas) || 0 };
}

async function main(): Promise<void> {
  if (process.argv[2] !== '--confirmar') {
    console.error('Uso: node dist/scripts/depurar-accesos.js --confirmar');
    process.exit(2);
  }
  const ds = await new DataSource({ ...opcionesTypeOrm(), migrationsRun: false }).initialize();
  try {
    const r = await ds.transaction((m) => depurarAccesos(m));
    console.log(`Bitácora de accesos depurada: ${r.borradas} entrada(s) con más de ${r.dias} días.`);
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
