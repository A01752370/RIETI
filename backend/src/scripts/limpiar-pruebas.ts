import 'reflect-metadata';
import { DeleteObjectsCommand, ListObjectVersionsCommand, S3Client } from '@aws-sdk/client-s3';
import { DataSource, EntityManager } from 'typeorm';
import { opcionesTypeOrm } from '../config/typeorm.config';
import { PATRON_FOLIO } from '../reportes/clasificacion';

/**
 * Herramienta de ADMINISTRACIÓN (no es una ruta del API): borra los **reportes de prueba**
 * con todo lo que cuelga de ellos. Segura e idempotente:
 *
 * - Solo actúa sobre una lista explícita de folios (`--folios`) o sobre la marca `[PRUEBA]`
 *   al inicio de la descripción (`--marca`); nunca "todo".
 * - `--dry-run` simula todo dentro de una transacción que se revierte y muestra qué borraría.
 *   Sin `--dry-run` exige `--confirmar`.
 * - Borra: bitácora (`seguimiento`) y accesos (`acceso_expediente`) desactivando sus triggers
 *   dentro de la misma transacción, referencias a fotos, casos, folios, menores, ubicaciones y
 *   el reporte; retira los vínculos de duplicado de otros reportes hacia los borrados (lo anota
 *   en su bitácora); elimina las alertas de punto recurrente que ya no reúnen el mínimo de
 *   reportes; y, después de confirmar la transacción, borra de S3 las fotos y sus versiones.
 * - Repetirla no hace nada: los folios que ya no existen se informan y se omiten.
 *
 * Requiere el usuario maestro (dueño de las tablas) y, para S3, el rol de limpieza (ver runbook).
 *
 * Uso (tarea única de ECS):
 *   node dist/scripts/limpiar-pruebas.js --folios RIETI-ATZ-2026-000019,RIETI-2026-000018 --dry-run
 *   node dist/scripts/limpiar-pruebas.js --marca --confirmar
 */

/** Marca de los reportes ficticios: prefijo de la descripción. */
export const MARCA_PRUEBA = '[PRUEBA]';

/** Qué limpiar. */
export interface Criterios {
  folios: string[];
  marca: boolean;
}

/** Resumen de lo que se borró (o se borraría en simulación). Sin datos de los reportes. */
export interface PlanLimpieza {
  reportes: { folio: string; municipio: string | null; fecha: string; seguimientos: number; accesos: number; fotos: number }[];
  noEncontrados: string[];
  vinculosRetirados: number;
  alertasEliminadas: number;
  clavesS3: string[];
}

/** Lee los argumentos de la línea de comandos (puro, probado). */
export function leerArgumentos(args: string[]): { criterios: Criterios; simular: boolean; confirmar: boolean } | { error: string } {
  const i = args.indexOf('--folios');
  const folios = i >= 0 ? (args[i + 1] ?? '').split(',').map((f) => f.trim().toUpperCase()).filter(Boolean) : [];
  const marca = args.includes('--marca');
  const simular = args.includes('--dry-run');
  const confirmar = args.includes('--confirmar');
  if (folios.length === 0 && !marca) return { error: 'Indica --folios F1,F2,... o --marca' };
  const malos = folios.filter((f) => !PATRON_FOLIO.test(f));
  if (malos.length > 0) return { error: `Folios con formato inválido: ${malos.join(', ')}` };
  if (!simular && !confirmar) return { error: 'Sin --dry-run hay que agregar --confirmar' };
  return { criterios: { folios: [...new Set(folios)], marca }, simular, confirmar };
}

/**
 * Borra los reportes de prueba dentro de la transacción `m` y devuelve el plan. Las fotos de S3
 * no se tocan aquí (ver {@link borrarObjetosS3}): se borran solo si la transacción se confirma.
 */
export async function limpiarPruebas(m: EntityManager, c: Criterios): Promise<PlanLimpieza> {
  const filas: { id: number; folio: string; municipio: string | null; id_municipio: number | null; fecha: Date; id_ubicacion: number }[] = await m.query(
    `SELECT r.id_reporte AS id, f.codigo AS folio, mu.nombre AS municipio, r.id_municipio, r.fecha_creacion AS fecha, r.id_ubicacion
     FROM reporte r JOIN folio f ON f.id_reporte = r.id_reporte LEFT JOIN municipio mu ON mu.id_municipio = r.id_municipio
     WHERE f.codigo = ANY($1::text[]) OR ($2::boolean AND r.descripcion LIKE $3)
     ORDER BY r.id_reporte FOR UPDATE OF r`, [c.folios, c.marca, `${MARCA_PRUEBA}%`]);
  const encontrados = new Set(filas.map((x) => x.folio));
  const plan: PlanLimpieza = {
    reportes: [], noEncontrados: c.folios.filter((f) => !encontrados.has(f)), vinculosRetirados: 0, alertasEliminadas: 0, clavesS3: [],
  };
  if (filas.length === 0) return plan;
  const ids = filas.map((x) => Number(x.id));

  // Casos que solo pertenecen a reportes borrados.
  const casos: { id_caso: number }[] = await m.query(
    `SELECT DISTINCT rc.id_caso FROM reporte_caso rc WHERE rc.id_reporte = ANY($1::int[])
     AND NOT EXISTS (SELECT 1 FROM reporte_caso o WHERE o.id_caso = rc.id_caso AND NOT (o.id_reporte = ANY($1::int[])))`, [ids]);
  const idsCaso = casos.map((x) => Number(x.id_caso));

  for (const x of filas) {
    const [{ s }] = await m.query(
      'SELECT count(*)::int AS s FROM seguimiento WHERE id_caso IN (SELECT id_caso FROM reporte_caso WHERE id_reporte = $1)', [x.id]);
    const [{ a }] = await m.query('SELECT count(*)::int AS a FROM acceso_expediente WHERE id_reporte = $1', [x.id]);
    const [{ n }] = await m.query('SELECT count(*)::int AS n FROM foto_reporte WHERE id_reporte = $1', [x.id]);
    plan.reportes.push({ folio: x.folio, municipio: x.municipio, fecha: new Date(x.fecha).toISOString(), seguimientos: s, accesos: a, fotos: n });
  }
  plan.clavesS3 = (await m.query('SELECT clave_objeto FROM foto_reporte WHERE id_reporte = ANY($1::int[]) ORDER BY id_foto', [ids]))
    .map((x: { clave_objeto: string }) => x.clave_objeto);

  // Otros reportes que apuntaban a un borrado como principal: se desvinculan y se anota en su bitácora.
  const huerfanos: { id: number }[] = await m.query(
    'SELECT id_reporte AS id FROM reporte WHERE duplicado_de = ANY($1::int[]) AND NOT (id_reporte = ANY($1::int[]))', [ids]);
  for (const h of huerfanos) {
    await m.query('UPDATE reporte SET duplicado_de = NULL WHERE id_reporte = $1', [h.id]);
    await m.query(
      `INSERT INTO seguimiento (id_caso, id_estatus, comentario, tipo)
       SELECT c.id_caso, c.id_estatus, 'Se retiró el vínculo de duplicado: el reporte principal era de prueba y se eliminó', 'expediente'
       FROM reporte_caso rc JOIN caso c ON c.id_caso = rc.id_caso WHERE rc.id_reporte = $1`, [h.id]);
  }
  plan.vinculosRetirados = huerfanos.length;

  await m.query('ALTER TABLE seguimiento DISABLE TRIGGER tr_seguimiento_inmutable');
  await m.query('ALTER TABLE acceso_expediente DISABLE TRIGGER tr_acceso_expediente_solo_insercion');
  await m.query('DELETE FROM seguimiento WHERE id_caso = ANY($1::int[])', [idsCaso]);
  await m.query('DELETE FROM acceso_expediente WHERE id_reporte = ANY($1::int[])', [ids]);
  await m.query('ALTER TABLE acceso_expediente ENABLE TRIGGER tr_acceso_expediente_solo_insercion');
  await m.query('ALTER TABLE seguimiento ENABLE TRIGGER tr_seguimiento_inmutable');

  await m.query('UPDATE reporte SET duplicado_de = NULL WHERE id_reporte = ANY($1::int[])', [ids]);
  await m.query('DELETE FROM foto_reporte WHERE id_reporte = ANY($1::int[])', [ids]);
  await m.query('DELETE FROM reporte_caso WHERE id_reporte = ANY($1::int[])', [ids]);
  await m.query('DELETE FROM caso WHERE id_caso = ANY($1::int[])', [idsCaso]);
  await m.query('DELETE FROM folio WHERE id_reporte = ANY($1::int[])', [ids]);
  await m.query('DELETE FROM reporte_menores_grupo WHERE id_reporte = ANY($1::int[])', [ids]);
  await m.query('DELETE FROM reporte WHERE id_reporte = ANY($1::int[])', [ids]);
  await m.query('DELETE FROM ubicacion WHERE id_ubicacion = ANY($1::int[])', [filas.map((x) => x.id_ubicacion)]);

  // Alertas de los municipios afectados que, sin los reportes de prueba, ya no reúnen el mínimo.
  const municipios = [...new Set(filas.map((x) => x.id_municipio).filter((x): x is number => x !== null))];
  const [borradas] = await m.query(
    `WITH p AS (SELECT
       coalesce((SELECT valor FROM configuracion WHERE clave = 'alerta_radio_m'), 150) AS radio,
       coalesce((SELECT valor FROM configuracion WHERE clave = 'alerta_dias'), 30)::int AS dias,
       coalesce((SELECT valor FROM configuracion WHERE clave = 'alerta_minimo'), 3)::int AS minimo)
     DELETE FROM alerta_territorial a USING p
     WHERE a.id_municipio = ANY($1::int[])
       AND (SELECT count(*) FROM reporte r JOIN ubicacion u ON u.id_ubicacion = r.id_ubicacion
            WHERE r.id_municipio = a.id_municipio AND u.punto IS NOT NULL
              AND r.fecha_creacion BETWEEN a.fecha_creacion - make_interval(days => p.dias) AND a.fecha_actualizacion + interval '1 minute'
              AND ST_DWithin(u.punto, ST_SetSRID(ST_MakePoint(a.longitud, a.latitud), 4326)::geography, p.radio)) < p.minimo
     RETURNING a.id_alerta`, [municipios]);
  plan.alertasEliminadas = Array.isArray(borradas) ? borradas.length : 0;
  return plan;
}

/** Versiones de los objetos en S3 de las fotos (y restos en la zona de entrada) de esos reportes. */
export async function versionesS3(s3: S3Client, bucket: string, claves: string[]): Promise<{ Key: string; VersionId?: string }[]> {
  const versiones: { Key: string; VersionId?: string }[] = [];
  for (const clave of claves) {
    let marcador: { KeyMarker?: string; VersionIdMarker?: string } = {};
    do {
      const r = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: clave, ...marcador }));
      for (const v of [...(r.Versions ?? []), ...(r.DeleteMarkers ?? [])]) if (v.Key === clave) versiones.push({ Key: v.Key, VersionId: v.VersionId });
      marcador = r.IsTruncated ? { KeyMarker: r.NextKeyMarker, VersionIdMarker: r.NextVersionIdMarker } : {};
    } while (marcador.KeyMarker);
  }
  return versiones;
}

/** Borra definitivamente (todas las versiones) los objetos indicados. Idempotente. */
export async function borrarObjetosS3(s3: S3Client, bucket: string, versiones: { Key: string; VersionId?: string }[]): Promise<number> {
  let borrados = 0;
  for (let i = 0; i < versiones.length; i += 1000) {
    const lote = versiones.slice(i, i + 1000);
    const r = await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: lote, Quiet: true } }));
    if (r.Errors?.length) throw new Error(`S3 no borró ${r.Errors.length} objeto(s): ${r.Errors.map((e) => e.Code).join(', ')}`);
    borrados += lote.length;
  }
  return borrados;
}

/** Texto del plan para el log (sin descripciones ni coordenadas). */
export function textoPlan(p: PlanLimpieza, simular: boolean): string {
  const verbo = simular ? 'Se borrarían' : 'Se borraron';
  return [
    `${simular ? 'SIMULACIÓN (no se cambió nada)' : 'LIMPIEZA'}: ${verbo} ${p.reportes.length} reporte(s).`,
    ...p.reportes.map((r) => `  ${r.folio} · ${r.municipio ?? 'sin municipio'} · ${r.fecha.slice(0, 10)} · bitácora ${r.seguimientos} · accesos ${r.accesos} · fotos ${r.fotos}`),
    `  Vínculos de duplicado retirados en otros reportes: ${p.vinculosRetirados}`,
    `  Alertas de punto recurrente eliminadas: ${p.alertasEliminadas}`,
    `  Fotos en S3: ${p.clavesS3.length}`,
    p.noEncontrados.length ? `  Folios que no existen (se omiten): ${p.noEncontrados.join(', ')}` : '  Todos los folios indicados existen.',
  ].join('\n');
}

/** Error que revierte la transacción de la simulación sin perder el plan. */
class Simulacion extends Error {
  constructor(readonly plan: PlanLimpieza) { super('simulación'); }
}

async function main(): Promise<void> {
  const a = leerArgumentos(process.argv.slice(2));
  if ('error' in a) {
    console.error(`${a.error}\nUso: node dist/scripts/limpiar-pruebas.js (--folios F1,F2 | --marca) (--dry-run | --confirmar)`);
    process.exit(2);
  }
  const ds = await new DataSource({ ...opcionesTypeOrm(), migrationsRun: false }).initialize();
  try {
    let plan: PlanLimpieza;
    try {
      plan = await ds.transaction(async (m) => {
        const p = await limpiarPruebas(m, a.criterios);
        if (a.simular) throw new Simulacion(p);
        return p;
      });
    } catch (e) {
      if (!(e instanceof Simulacion)) throw e;
      plan = e.plan;
    }
    console.log(textoPlan(plan, a.simular));
    const bucket = process.env.EVIDENCIAS_BUCKET;
    if (plan.clavesS3.length > 0 && bucket) {
      const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'mx-central-1' });
      const versiones = await versionesS3(s3, bucket, plan.clavesS3);
      if (a.simular) console.log(`  Versiones de objetos en S3 que se borrarían: ${versiones.length}`);
      else console.log(`  Versiones de objetos borradas en S3: ${await borrarObjetosS3(s3, bucket, versiones)}`);
    }
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
