import { MigrationInterface, QueryRunner } from 'typeorm';
import { MUNICIPIOS_EDOMEX } from '../datos/municipios-edomex';

/**
 * D-16 y D-17: catálogo de los 125 municipios del Estado de México y
 * directorio de contactos de la red de municipios.
 *
 * Es **aditiva e idempotente**, segura para una base con datos:
 * - Solo agrega columnas (`clave_inegi`, `activo`) con valor por defecto, un
 *   índice único parcial y una tabla nueva; no borra ni cambia tipos.
 * - La fila existente de Atizapán de Zaragoza (referenciada por usuarios o
 *   reportes) se conserva y solo recibe su clave `15013`.
 * - Los demás municipios se insertan con `ON CONFLICT DO NOTHING`, así que
 *   correrla de nuevo no duplica nada.
 * - Los contactos de ejemplo usan solo el dominio reservado `example.org` y
 *   llevan `es_ejemplo = true`; los reales se cargan como datos, sin cambiar código.
 */
export class MunicipiosYRed1760200000000 implements MigrationInterface {
  name = 'MunicipiosYRed1760200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE municipio
        ADD COLUMN IF NOT EXISTS clave_inegi varchar(5),
        ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_municipio_clave_inegi ON municipio (clave_inegi)
        WHERE clave_inegi IS NOT NULL;
      UPDATE municipio SET clave_inegi = '15013'
        WHERE nombre = 'Atizapán de Zaragoza' AND clave_inegi IS NULL
          AND NOT EXISTS (SELECT 1 FROM municipio WHERE clave_inegi = '15013');
    `);

    // Un solo INSERT parametrizado con los 125 municipios del catálogo de INEGI.
    const valores = MUNICIPIOS_EDOMEX.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, 'Estado de México')`).join(', ');
    await q.query(
      `INSERT INTO municipio (clave_inegi, nombre, estado) VALUES ${valores}
       ON CONFLICT (clave_inegi) WHERE clave_inegi IS NOT NULL DO NOTHING`,
      MUNICIPIOS_EDOMEX.flatMap(([clave, nombre]) => [clave, nombre]),
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS contacto_municipio (
        id_contacto serial PRIMARY KEY,
        id_municipio integer NOT NULL REFERENCES municipio(id_municipio),
        tipo varchar(10) NOT NULL CHECK (tipo IN ('correo', 'enlace')),
        valor varchar(300) NOT NULL,
        etiqueta varchar(120),
        es_ejemplo boolean NOT NULL DEFAULT false,
        fecha_actualizacion timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS ix_contacto_municipio ON contacto_municipio (id_municipio);

      INSERT INTO contacto_municipio (id_municipio, tipo, valor, etiqueta, es_ejemplo)
      SELECT m.id_municipio, c.tipo, c.valor, c.etiqueta, true
      FROM municipio m
      CROSS JOIN (VALUES
        ('correo', 'enlace.atizapan@example.org', 'Enlace municipal (ejemplo)'),
        ('enlace', 'https://example.org', 'Sitio del municipio (ejemplo)')
      ) AS c(tipo, valor, etiqueta)
      WHERE m.clave_inegi = '15013'
        AND NOT EXISTS (SELECT 1 FROM contacto_municipio x WHERE x.id_municipio = m.id_municipio);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Se quitan solo los municipios agregados aquí que nada referencia.
    await q.query(`
      DROP TABLE IF EXISTS contacto_municipio;
      DELETE FROM municipio m
        WHERE m.clave_inegi IS NOT NULL AND m.clave_inegi <> '15013'
          AND NOT EXISTS (SELECT 1 FROM reporte r WHERE r.id_municipio = m.id_municipio)
          AND NOT EXISTS (SELECT 1 FROM usuario u WHERE u.id_municipio = m.id_municipio);
      DROP INDEX IF EXISTS ux_municipio_clave_inegi;
      ALTER TABLE municipio DROP COLUMN IF EXISTS activo, DROP COLUMN IF EXISTS clave_inegi;
    `);
  }
}
