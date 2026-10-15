import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 4 (D-19): cuentas **opcionales** de ciudadano.
 *
 * - `cuentas_ciudadano` guarda solo el identificador de Cognito (`sub`) y fechas.
 *   El correo vive únicamente en Cognito: la base de RIETI no guarda datos de contacto.
 * - `reporte.cuenta_ciudadano_id` (opcional) vincula un reporte a la cuenta solo
 *   si la persona lo pidió. Con `ON DELETE SET NULL`, eliminar la cuenta conserva
 *   el reporte para su atención, ya sin vínculo con la persona.
 *
 * Aditiva, idempotente y reversible.
 */
export class CuentasCiudadano1760400000000 implements MigrationInterface {
  name = 'CuentasCiudadano1760400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS cuentas_ciudadano (
        id_cuenta serial PRIMARY KEY,
        cognito_sub uuid NOT NULL UNIQUE,
        fecha_creacion timestamptz NOT NULL DEFAULT now(),
        ultimo_acceso timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE reporte ADD COLUMN IF NOT EXISTS cuenta_ciudadano_id integer;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_reporte_cuenta_ciudadano') THEN
          ALTER TABLE reporte ADD CONSTRAINT fk_reporte_cuenta_ciudadano
            FOREIGN KEY (cuenta_ciudadano_id) REFERENCES cuentas_ciudadano(id_cuenta) ON DELETE SET NULL;
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS ix_reporte_cuenta_ciudadano ON reporte (cuenta_ciudadano_id) WHERE cuenta_ciudadano_id IS NOT NULL;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX IF EXISTS ix_reporte_cuenta_ciudadano;
      ALTER TABLE reporte DROP CONSTRAINT IF EXISTS fk_reporte_cuenta_ciudadano;
      ALTER TABLE reporte DROP COLUMN IF EXISTS cuenta_ciudadano_id;
      DROP TABLE IF EXISTS cuentas_ciudadano;
    `);
  }
}
