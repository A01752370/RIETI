import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 8: evidencia fotográfica opcional (D-42). Solo guarda la referencia al objeto en S3
 * (nombre aleatorio), tamaño, dimensiones y huella SHA-256 de la imagen re-codificada.
 * Aditiva, idempotente y reversible.
 */
export class FotosReporte1760700000000 implements MigrationInterface {
  name = 'FotosReporte1760700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS foto_reporte (
        id_foto serial PRIMARY KEY,
        id_reporte integer NOT NULL REFERENCES reporte(id_reporte) ON DELETE CASCADE,
        clave_objeto varchar(200) NOT NULL UNIQUE,
        bytes integer NOT NULL CHECK (bytes > 0),
        ancho smallint NOT NULL CHECK (ancho > 0),
        alto smallint NOT NULL CHECK (alto > 0),
        sha256 char(64) NOT NULL,
        fecha timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS ix_foto_reporte_reporte ON foto_reporte (id_reporte);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS foto_reporte');
  }
}
