import { MigrationInterface, QueryRunner } from 'typeorm';
import { CLAVES_FOLIO } from '../datos/claves-folio-municipios';

/** Actividades vigentes del selector, en orden (Fase 6, lista del socio formador). */
export const ACTIVIDADES_VIGENTES = [
  'Venta ambulante',
  'Limpieza de parabrisas o actividades en cruceros',
  'Mendicidad',
  'Carga y descarga',
  'Trabajo en comercio',
  'Trabajo en mercados o tianguis',
  'Trabajo agrícola',
  'Construcción',
  'Trabajo doméstico',
  'Recolección de residuos',
  'Talleres mecánicos',
  'Trabajo nocturno o en bares',
  'Otro',
  'No sé',
];

/**
 * Actividades que dejan de ofrecerse a la ciudadanía porque chocan con la lista del
 * socio o implican un juicio que no le corresponde (p. ej. "forzada", "explotación";
 * eso lo clasifica el personal como modalidad). Siguen siendo válidas para los
 * reportes y las APK anteriores.
 */
export const ACTIVIDADES_HEREDADAS = [
  'Mendicidad forzada',
  'Comercio familiar',
  'Servicio en comercios o restaurantes',
  'Cargador o carretillero',
  'Reciclaje o pepena',
  'Actividades ilícitas o explotación',
];

/** Rangos de edad en el orden del formulario; `12-17` queda solo como valor heredado. */
const ORDEN_RANGOS: [string, number, boolean][] = [
  ['0-5', 1, true], ['6-11', 2, true], ['12-14', 3, true], ['15-17', 4, true], ['12-17', 5, false], ['Sin determinar', 6, true],
];

/**
 * Fase 6: alineación con los documentos del socio formador.
 *
 * - `estatus_reporte.etiqueta`: nombre público de cada estatus (Recibido → Registrado,
 *   En atención → En seguimiento, Descartado → Cancelado) y dos estatus nuevos,
 *   Archivado y Reincidente. Los nombres internos no cambian (reglas, pruebas y APK anteriores).
 * - `rango_edad`: 12-14 y 15-17, con `orden` y `vigente` (12-17 queda como heredado).
 * - `actividad.vigente`: actividades nuevas de la lista del socio; las que chocan se ocultan sin borrarse.
 * - `municipio.clave_folio`: clave de 3 letras para el folio `RIETI-ATZ-2026-000123`.
 * - `reporte`: `peligro_inmediato`, `prioridad` (la calcula el servidor), `cantidad_categoria`,
 *   `canal` y `origen`. Los reportes existentes quedan con prioridad Media si se percibió riesgo.
 *
 * Aditiva, idempotente y reversible.
 */
export class AlineacionSocio1760500000000 implements MigrationInterface {
  name = 'AlineacionSocio1760500000000';

  public async up(q: QueryRunner): Promise<void> {
    // Estatus: etiqueta pública y estatus nuevos.
    await q.query(`
      ALTER TABLE estatus_reporte ADD COLUMN IF NOT EXISTS etiqueta varchar(40);
      UPDATE estatus_reporte SET etiqueta = CASE nombre
        WHEN 'Recibido' THEN 'Registrado' WHEN 'En atención' THEN 'En seguimiento' WHEN 'Descartado' THEN 'Cancelado' ELSE nombre END
        WHERE etiqueta IS NULL;
      INSERT INTO estatus_reporte (nombre, orden, etiqueta) VALUES ('Archivado', 7, 'Archivado'), ('Reincidente', 8, 'Reincidente')
        ON CONFLICT (nombre) DO NOTHING;
      ALTER TABLE estatus_reporte ALTER COLUMN etiqueta SET NOT NULL;
    `);

    // Rangos de edad.
    await q.query(`
      ALTER TABLE rango_edad ADD COLUMN IF NOT EXISTS orden smallint NOT NULL DEFAULT 100;
      ALTER TABLE rango_edad ADD COLUMN IF NOT EXISTS vigente boolean NOT NULL DEFAULT true;
      INSERT INTO rango_edad (nombre) VALUES ('12-14'), ('15-17') ON CONFLICT (nombre) DO NOTHING;
    `);
    for (const [nombre, orden, vigente] of ORDEN_RANGOS) {
      await q.query('UPDATE rango_edad SET orden = $2, vigente = $3 WHERE nombre = $1', [nombre, orden, vigente]);
    }

    // Actividades.
    await q.query('ALTER TABLE actividad ADD COLUMN IF NOT EXISTS vigente boolean NOT NULL DEFAULT true');
    await q.query('INSERT INTO actividad (nombre) SELECT unnest($1::text[]) ON CONFLICT (nombre) DO NOTHING', [ACTIVIDADES_VIGENTES]);
    await q.query(
      `UPDATE actividad a SET orden = o.posicion, vigente = true
       FROM unnest($1::text[]) WITH ORDINALITY AS o(nombre, posicion) WHERE a.nombre = o.nombre`, [ACTIVIDADES_VIGENTES]);
    await q.query('UPDATE actividad SET vigente = false, orden = 200 WHERE nombre = ANY($1::text[])', [ACTIVIDADES_HEREDADAS]);

    // Clave de folio por municipio.
    await q.query(`
      ALTER TABLE municipio ADD COLUMN IF NOT EXISTS clave_folio varchar(3);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_municipio_clave_folio ON municipio (clave_folio) WHERE clave_folio IS NOT NULL;
    `);
    await q.query(
      `UPDATE municipio m SET clave_folio = v.clave
       FROM unnest($1::text[], $2::text[]) AS v(inegi, clave)
       WHERE m.clave_inegi = v.inegi AND m.clave_folio IS NULL`,
      [CLAVES_FOLIO.map((c) => c[0]), CLAVES_FOLIO.map((c) => c[1])]);

    // Reporte: peligro inmediato, prioridad, cantidad, canal y origen.
    await q.query(`
      ALTER TABLE reporte ADD COLUMN IF NOT EXISTS peligro_inmediato varchar(6);
      ALTER TABLE reporte ADD COLUMN IF NOT EXISTS prioridad varchar(6) NOT NULL DEFAULT 'Normal';
      ALTER TABLE reporte ADD COLUMN IF NOT EXISTS cantidad_categoria varchar(6);
      ALTER TABLE reporte ADD COLUMN IF NOT EXISTS canal varchar(20);
      ALTER TABLE reporte ADD COLUMN IF NOT EXISTS origen varchar(20) NOT NULL DEFAULT 'ciudadano';
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_reporte_peligro') THEN
          ALTER TABLE reporte ADD CONSTRAINT ck_reporte_peligro CHECK (peligro_inmediato IS NULL OR peligro_inmediato IN ('Sí', 'No', 'No sé'));
          ALTER TABLE reporte ADD CONSTRAINT ck_reporte_prioridad CHECK (prioridad IN ('Alta', 'Media', 'Normal'));
          ALTER TABLE reporte ADD CONSTRAINT ck_reporte_cantidad CHECK (cantidad_categoria IS NULL OR cantidad_categoria IN ('1', '2', '3', '4', '5+', 'No sé'));
          ALTER TABLE reporte ADD CONSTRAINT ck_reporte_canal CHECK (canal IS NULL OR canal IN ('app', 'web', 'institucional', 'whatsapp'));
          ALTER TABLE reporte ADD CONSTRAINT ck_reporte_origen CHECK (origen IN ('ciudadano', 'institucional'));
        END IF;
      END $$;
      UPDATE reporte r SET prioridad = 'Media' FROM riesgo ri
        WHERE ri.id_riesgo = r.id_riesgo AND ri.nombre = 'Sí' AND r.prioridad = 'Normal' AND r.peligro_inmediato IS NULL;
      CREATE INDEX IF NOT EXISTS ix_reporte_prioridad ON reporte (prioridad);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX IF EXISTS ix_reporte_prioridad;
      ALTER TABLE reporte DROP CONSTRAINT IF EXISTS ck_reporte_peligro, DROP CONSTRAINT IF EXISTS ck_reporte_prioridad,
        DROP CONSTRAINT IF EXISTS ck_reporte_cantidad, DROP CONSTRAINT IF EXISTS ck_reporte_canal, DROP CONSTRAINT IF EXISTS ck_reporte_origen;
      ALTER TABLE reporte DROP COLUMN IF EXISTS peligro_inmediato, DROP COLUMN IF EXISTS prioridad,
        DROP COLUMN IF EXISTS cantidad_categoria, DROP COLUMN IF EXISTS canal, DROP COLUMN IF EXISTS origen;
      DROP INDEX IF EXISTS ux_municipio_clave_folio;
      ALTER TABLE municipio DROP COLUMN IF EXISTS clave_folio;
    `);
    await q.query(
      `DELETE FROM actividad a WHERE a.nombre = ANY($1::text[]) AND a.nombre <> ALL($2::text[])
         AND NOT EXISTS (SELECT 1 FROM reporte r WHERE r.id_actividad = a.id_actividad)`,
      [['Mendicidad', 'Carga y descarga', 'Trabajo en comercio', 'Recolección de residuos', 'No sé'], ACTIVIDADES_HEREDADAS]);
    await q.query(`
      ALTER TABLE actividad DROP COLUMN IF EXISTS vigente;
      DELETE FROM rango_edad x WHERE x.nombre IN ('12-14', '15-17')
        AND NOT EXISTS (SELECT 1 FROM reporte r WHERE r.id_rango_edad = x.id_rango_edad)
        AND NOT EXISTS (SELECT 1 FROM reporte_menores_grupo g WHERE g.id_rango_edad = x.id_rango_edad);
      ALTER TABLE rango_edad DROP COLUMN IF EXISTS orden, DROP COLUMN IF EXISTS vigente;
      DELETE FROM estatus_reporte e WHERE e.nombre IN ('Archivado', 'Reincidente')
        AND NOT EXISTS (SELECT 1 FROM caso c WHERE c.id_estatus = e.id_estatus)
        AND NOT EXISTS (SELECT 1 FROM seguimiento s WHERE s.id_estatus = e.id_estatus);
      ALTER TABLE estatus_reporte DROP COLUMN IF EXISTS etiqueta;
    `);
  }
}
