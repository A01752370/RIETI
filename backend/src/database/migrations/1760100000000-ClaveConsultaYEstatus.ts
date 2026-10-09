import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seguridad mínima para la entrega (P2):
 *
 * - `reporte.clave_consulta_hash`: hash Argon2id de la clave de consulta (D-15, RF-47).
 *   Es nullable porque los reportes previos no tienen clave; esos reportes no se
 *   pueden consultar públicamente (el de prueba se borra según el runbook).
 * - `reporte.aviso_privacidad_version`: versión del aviso aceptada (RF-44).
 * - `caso.motivo_descarte`: obligatorio al pasar a Descartado.
 * - Catálogo de estatus canónico de la Etapa 1 (D-11): se renombran
 *   Atendido → En atención y Cerrado → Concluido, se reordena Canalizado y se
 *   agrega Descartado. Al renombrar (y no borrar) se conservan las referencias
 *   de la bitácora `seguimiento`, que es solo de inserción.
 */
export class ClaveConsultaYEstatus1760100000000 implements MigrationInterface {
  name = 'ClaveConsultaYEstatus1760100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE reporte
        ADD COLUMN clave_consulta_hash varchar(200),
        ADD COLUMN aviso_privacidad_version varchar(20);
      ALTER TABLE caso ADD COLUMN motivo_descarte text;

      UPDATE estatus_reporte SET nombre = 'En atención', orden = 3 WHERE nombre = 'Atendido';
      UPDATE estatus_reporte SET orden = 4 WHERE nombre = 'Canalizado';
      UPDATE estatus_reporte SET nombre = 'Concluido', orden = 5 WHERE nombre = 'Cerrado';
      INSERT INTO estatus_reporte (nombre, orden) VALUES ('Descartado', 6) ON CONFLICT (nombre) DO NOTHING;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE estatus_reporte SET nombre = 'Cerrado', orden = 5 WHERE nombre = 'Concluido';
      UPDATE estatus_reporte SET orden = 3 WHERE nombre = 'Canalizado';
      UPDATE estatus_reporte SET nombre = 'Atendido', orden = 4 WHERE nombre = 'En atención';
      -- 'Descartado' se conserva si algún caso lo usa (no se puede borrar por la FK).
      DELETE FROM estatus_reporte e WHERE e.nombre = 'Descartado'
        AND NOT EXISTS (SELECT 1 FROM caso c WHERE c.id_estatus = e.id_estatus)
        AND NOT EXISTS (SELECT 1 FROM seguimiento s WHERE s.id_estatus = e.id_estatus);
      ALTER TABLE caso DROP COLUMN motivo_descarte;
      ALTER TABLE reporte DROP COLUMN aviso_privacidad_version, DROP COLUMN clave_consulta_hash;
    `);
  }
}
