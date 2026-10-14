import { MigrationInterface, QueryRunner } from 'typeorm';
import { FUENTE_GEOM_MUNICIPIOS, GEOM_MUNICIPIOS_EDOMEX } from '../datos/municipios-edomex-geom';

/** Actividades del catálogo ampliado (Fase 2), en el orden en que se muestran. "Otro" siempre al final. */
export const ACTIVIDADES_ORDENADAS = [
  'Venta ambulante',
  'Mendicidad forzada',
  'Limpieza de parabrisas o actividades en cruceros',
  'Trabajo en mercados o tianguis',
  'Comercio familiar',
  'Servicio en comercios o restaurantes',
  'Cargador o carretillero',
  'Reciclaje o pepena',
  'Trabajo doméstico',
  'Construcción',
  'Trabajo agrícola',
  'Talleres mecánicos',
  'Trabajo nocturno o en bares',
  'Actividades ilícitas o explotación',
  'Otro',
] as const;

/** Rango de edad para cuando quien reporta no puede estimar la edad. */
export const RANGO_SIN_DETERMINAR = 'Sin determinar';

/**
 * Fase 2 — formulario robusto y validación geográfica.
 *
 * **Aditiva, idempotente y reversible** (segura con datos en producción):
 * - Catálogos: agrega actividades, el rango "Sin determinar" y la columna `actividad.orden`.
 * - `reporte_menores_grupo`: menores por grupo de edad (tabla hija). Se rellena con
 *   un grupo por cada reporte existente a partir de `id_rango_edad` y `cantidad_ninos`,
 *   que se conservan (las APK instaladas los siguen enviando).
 * - `reporte.actividad_otro` y columnas de dirección en `ubicacion`, todas opcionales.
 * - `municipio_geom`: polígonos del INEGI con índice GiST, para validar que el
 *   punto del mapa cae en el municipio elegido.
 * - `codigo_postal_municipio`: **vacía**. El catálogo de SEPOMEX no permite su
 *   distribución, así que no se versiona; un operador lo carga con
 *   `scripts/cargar-codigos-postales.ts` si el área jurídica lo autoriza.
 *
 * Por qué tabla hija y no JSONB para los grupos: integridad referencial con
 * `rango_edad`, restricciones `CHECK` en la base, una fila por grupo sin
 * duplicados (llave primaria) y agregados directos en SQL para las estadísticas.
 */
export class FormularioYGeografia1760300000000 implements MigrationInterface {
  name = 'FormularioYGeografia1760300000000';

  public async up(q: QueryRunner): Promise<void> {
    // --- Catálogos ---
    await q.query(`ALTER TABLE actividad ADD COLUMN IF NOT EXISTS orden smallint NOT NULL DEFAULT 100`);
    await q.query(
      `INSERT INTO actividad (nombre) SELECT unnest($1::text[]) ON CONFLICT (nombre) DO NOTHING`,
      [ACTIVIDADES_ORDENADAS],
    );
    await q.query(
      `UPDATE actividad a SET orden = o.posicion
       FROM unnest($1::text[]) WITH ORDINALITY AS o(nombre, posicion)
       WHERE a.nombre = o.nombre`,
      [ACTIVIDADES_ORDENADAS],
    );
    await q.query(`INSERT INTO rango_edad (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING`, [RANGO_SIN_DETERMINAR]);

    // --- Menores por grupo de edad ---
    await q.query(`
      CREATE TABLE IF NOT EXISTS reporte_menores_grupo (
        id_reporte integer NOT NULL REFERENCES reporte(id_reporte),
        id_rango_edad integer NOT NULL REFERENCES rango_edad(id_rango_edad),
        cantidad smallint NOT NULL CHECK (cantidad BETWEEN 1 AND 99),
        PRIMARY KEY (id_reporte, id_rango_edad)
      );
      CREATE INDEX IF NOT EXISTS ix_menores_grupo_rango ON reporte_menores_grupo (id_rango_edad);
      INSERT INTO reporte_menores_grupo (id_reporte, id_rango_edad, cantidad)
        SELECT r.id_reporte, r.id_rango_edad, LEAST(r.cantidad_ninos, 99) FROM reporte r
        WHERE NOT EXISTS (SELECT 1 FROM reporte_menores_grupo g WHERE g.id_reporte = r.id_reporte);
    `);

    // --- Actividad "Otro" y dirección estructurada (todo opcional) ---
    await q.query(`
      ALTER TABLE reporte ADD COLUMN IF NOT EXISTS actividad_otro varchar(120);
      ALTER TABLE ubicacion
        ADD COLUMN IF NOT EXISTS calle varchar(120),
        ADD COLUMN IF NOT EXISTS numero_exterior varchar(20),
        ADD COLUMN IF NOT EXISTS colonia varchar(120),
        ADD COLUMN IF NOT EXISTS codigo_postal varchar(5),
        ADD COLUMN IF NOT EXISTS referencias varchar(300);
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ubicacion_codigo_postal') THEN
          ALTER TABLE ubicacion ADD CONSTRAINT ck_ubicacion_codigo_postal CHECK (codigo_postal ~ '^[0-9]{5}$');
        END IF;
      END $$;
    `);

    // --- Polígonos municipales (INEGI) ---
    await q.query(`
      CREATE TABLE IF NOT EXISTS municipio_geom (
        id_municipio integer PRIMARY KEY REFERENCES municipio(id_municipio),
        geom geometry(MultiPolygon, 4326) NOT NULL,
        fuente varchar(120) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_municipio_geom ON municipio_geom USING GIST (geom);
    `);
    for (const [clave, geojson] of Object.entries(GEOM_MUNICIPIOS_EDOMEX)) {
      // ST_MakeValid corrige autointersecciones que pudiera dejar la simplificación;
      // ST_CollectionExtract(…, 3) se queda solo con los polígonos.
      await q.query(
        `INSERT INTO municipio_geom (id_municipio, geom, fuente)
         SELECT m.id_municipio,
                ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)), 3)),
                $3
         FROM municipio m WHERE m.clave_inegi = $1
         ON CONFLICT (id_municipio) DO NOTHING`,
        [clave, geojson, FUENTE_GEOM_MUNICIPIOS],
      );
    }

    // --- Códigos postales (vacía; ver comentario de la clase) ---
    await q.query(`
      CREATE TABLE IF NOT EXISTS codigo_postal_municipio (
        codigo_postal varchar(5) NOT NULL CHECK (codigo_postal ~ '^[0-9]{5}$'),
        clave_inegi varchar(5) NOT NULL,
        PRIMARY KEY (codigo_postal, clave_inegi)
      );
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE IF EXISTS codigo_postal_municipio;
      DROP TABLE IF EXISTS municipio_geom;
      ALTER TABLE ubicacion DROP CONSTRAINT IF EXISTS ck_ubicacion_codigo_postal;
      ALTER TABLE ubicacion
        DROP COLUMN IF EXISTS referencias, DROP COLUMN IF EXISTS codigo_postal, DROP COLUMN IF EXISTS colonia,
        DROP COLUMN IF EXISTS numero_exterior, DROP COLUMN IF EXISTS calle;
      ALTER TABLE reporte DROP COLUMN IF EXISTS actividad_otro;
      DROP TABLE IF EXISTS reporte_menores_grupo;
    `);
    // Solo se quitan los valores de catálogo agregados aquí que ningún reporte usa.
    await q.query(
      `DELETE FROM actividad a WHERE a.nombre = ANY($1::text[])
         AND a.nombre NOT IN ('Mendicidad forzada', 'Trabajo doméstico', 'Venta ambulante', 'Construcción', 'Trabajo agrícola', 'Otro')
         AND NOT EXISTS (SELECT 1 FROM reporte r WHERE r.id_actividad = a.id_actividad)`,
      [ACTIVIDADES_ORDENADAS],
    );
    await q.query(
      `DELETE FROM rango_edad x WHERE x.nombre = $1 AND NOT EXISTS (SELECT 1 FROM reporte r WHERE r.id_rango_edad = x.id_rango_edad)`,
      [RANGO_SIN_DETERMINAR],
    );
    await q.query(`ALTER TABLE actividad DROP COLUMN IF EXISTS orden`);
  }
}
