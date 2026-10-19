import { MigrationInterface, QueryRunner } from 'typeorm';

/** Dependencias de canalización (catálogo provisional hasta que el socio entregue el oficial). */
export const DEPENDENCIAS = [
  'DIF municipal',
  'Procuraduría de Protección de Niñas, Niños y Adolescentes',
  'Secretaría del Trabajo',
  'Fiscalía',
  'Otra',
];

/** Modalidades de trabajo infantil (documento "Lista de estatus" del socio). Las asigna el personal. */
export const MODALIDADES = [
  'Mendicidad forzada',
  'Explotación sexual',
  'Trata de personas',
  'Utilización para actividades ilícitas',
  'Trabajo peligroso',
  'Otra situación de explotación y/o vulneración',
];

/** Parámetros editables por el Administrador (valores iniciales). */
export const CONFIGURACION_INICIAL: [string, number, string][] = [
  ['duplicados_radio_m', 150, 'Radio (m) para sugerir posibles duplicados'],
  ['duplicados_dias', 30, 'Ventana (días) para sugerir posibles duplicados'],
  ['alerta_radio_m', 150, 'Radio (m) de una alerta de punto recurrente'],
  ['alerta_dias', 30, 'Ventana (días) de una alerta de punto recurrente'],
  ['alerta_minimo', 3, 'Reportes mínimos en el radio y la ventana para crear una alerta'],
  ['accesos_conservacion_dias', 365, 'Días que se conserva la bitácora de accesos (política provisional)'],
];

/**
 * Fase 7: expediente interno y control territorial.
 *
 * - Rol "Coordinador regional" y `asignacion_municipio` (personal ↔ municipios). El personal
 *   con rol "Personal SIPINNA" (enlace municipal) queda asignado a su `usuario.id_municipio`
 *   o, si no tiene, a Atizapán de Zaragoza (municipio piloto), para no perder acceso al desplegar.
 * - Catálogos `dependencia` y `modalidad`.
 * - Campos del expediente en `caso` (responsable, dependencia, fecha de seguimiento, resultado,
 *   cierre, modalidad, verificación, NNA identificados y canalizados, niñas y niños).
 * - `reporte.duplicado_de` (posible duplicidad; nunca se fusiona ni se borra nada).
 * - `seguimiento.tipo` (nota, acción, expediente) para la bitácora tipada.
 * - `configuracion`, `alerta_territorial` y `acceso_expediente` (bitácora de accesos, append-only).
 *
 * Aditiva, idempotente y reversible.
 */
export class ExpedienteTerritorial1760600000000 implements MigrationInterface {
  name = 'ExpedienteTerritorial1760600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO rol_usuario (nombre, es_personal) VALUES ('Coordinador regional', true) ON CONFLICT (nombre) DO NOTHING;

      CREATE TABLE IF NOT EXISTS asignacion_municipio (
        id_usuario integer NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
        id_municipio integer NOT NULL REFERENCES municipio(id_municipio),
        fecha_asignacion timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (id_usuario, id_municipio)
      );
      INSERT INTO asignacion_municipio (id_usuario, id_municipio)
        SELECT u.id_usuario, coalesce(u.id_municipio, (SELECT id_municipio FROM municipio WHERE clave_inegi = '15013'))
        FROM usuario u JOIN rol_usuario r ON r.id_rol = u.id_rol
        WHERE r.nombre = 'Personal SIPINNA'
        ON CONFLICT DO NOTHING;

      CREATE TABLE IF NOT EXISTS dependencia (
        id_dependencia serial PRIMARY KEY, nombre varchar(120) NOT NULL UNIQUE, orden smallint NOT NULL DEFAULT 100, activo boolean NOT NULL DEFAULT true
      );
      CREATE TABLE IF NOT EXISTS modalidad (
        id_modalidad serial PRIMARY KEY, nombre varchar(120) NOT NULL UNIQUE, orden smallint NOT NULL DEFAULT 100
      );
    `);
    await q.query(
      `INSERT INTO dependencia (nombre, orden) SELECT d, o FROM unnest($1::text[]) WITH ORDINALITY AS t(d, o) ON CONFLICT (nombre) DO NOTHING`, [DEPENDENCIAS]);
    await q.query(
      `INSERT INTO modalidad (nombre, orden) SELECT d, o FROM unnest($1::text[]) WITH ORDINALITY AS t(d, o) ON CONFLICT (nombre) DO NOTHING`, [MODALIDADES]);

    await q.query(`
      ALTER TABLE caso ADD COLUMN IF NOT EXISTS id_responsable integer REFERENCES usuario(id_usuario);
      ALTER TABLE caso ADD COLUMN IF NOT EXISTS id_dependencia integer REFERENCES dependencia(id_dependencia);
      ALTER TABLE caso ADD COLUMN IF NOT EXISTS fecha_seguimiento date;
      ALTER TABLE caso ADD COLUMN IF NOT EXISTS resultado varchar(1000);
      ALTER TABLE caso ADD COLUMN IF NOT EXISTS fecha_cierre timestamptz;
      ALTER TABLE caso ADD COLUMN IF NOT EXISTS id_modalidad integer REFERENCES modalidad(id_modalidad);
      ALTER TABLE caso ADD COLUMN IF NOT EXISTS verificacion varchar(20) NOT NULL DEFAULT 'Sin verificar';
      ALTER TABLE caso ADD COLUMN IF NOT EXISTS nna_identificados smallint;
      ALTER TABLE caso ADD COLUMN IF NOT EXISTS nna_canalizados smallint;
      ALTER TABLE caso ADD COLUMN IF NOT EXISTS nna_ninas smallint;
      ALTER TABLE caso ADD COLUMN IF NOT EXISTS nna_ninos smallint;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_caso_verificacion') THEN
          ALTER TABLE caso ADD CONSTRAINT ck_caso_verificacion CHECK (verificacion IN ('Sin verificar', 'Verificado', 'Caso confirmado', 'No procede'));
          ALTER TABLE caso ADD CONSTRAINT ck_caso_nna CHECK (
            coalesce(nna_identificados, 0) BETWEEN 0 AND 99 AND coalesce(nna_canalizados, 0) BETWEEN 0 AND 99
            AND coalesce(nna_ninas, 0) BETWEEN 0 AND 99 AND coalesce(nna_ninos, 0) BETWEEN 0 AND 99);
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS ix_caso_fecha_seguimiento ON caso (fecha_seguimiento) WHERE fecha_seguimiento IS NOT NULL;

      ALTER TABLE reporte ADD COLUMN IF NOT EXISTS duplicado_de integer REFERENCES reporte(id_reporte) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS ix_reporte_duplicado_de ON reporte (duplicado_de) WHERE duplicado_de IS NOT NULL;

      ALTER TABLE seguimiento ADD COLUMN IF NOT EXISTS tipo varchar(12);
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_seguimiento_tipo') THEN
          ALTER TABLE seguimiento ADD CONSTRAINT ck_seguimiento_tipo CHECK (tipo IS NULL OR tipo IN ('nota', 'accion', 'expediente'));
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS configuracion (
        clave varchar(40) PRIMARY KEY, valor numeric NOT NULL, descripcion varchar(200) NOT NULL,
        fecha_actualizacion timestamptz NOT NULL DEFAULT now(), id_usuario integer REFERENCES usuario(id_usuario)
      );
    `);
    await q.query(
      `INSERT INTO configuracion (clave, valor, descripcion) SELECT c, v, d FROM unnest($1::text[], $2::numeric[], $3::text[]) AS t(c, v, d)
       ON CONFLICT (clave) DO NOTHING`,
      [CONFIGURACION_INICIAL.map((c) => c[0]), CONFIGURACION_INICIAL.map((c) => c[1]), CONFIGURACION_INICIAL.map((c) => c[2])]);

    await q.query(`
      CREATE TABLE IF NOT EXISTS alerta_territorial (
        id_alerta serial PRIMARY KEY,
        id_municipio integer REFERENCES municipio(id_municipio),
        latitud numeric(9,5) NOT NULL,
        longitud numeric(9,5) NOT NULL,
        reportes smallint NOT NULL,
        estatus varchar(10) NOT NULL DEFAULT 'abierta' CHECK (estatus IN ('abierta', 'atendida')),
        fecha_creacion timestamptz NOT NULL DEFAULT now(),
        fecha_actualizacion timestamptz NOT NULL DEFAULT now(),
        id_usuario_atendio integer REFERENCES usuario(id_usuario),
        comentario varchar(500)
      );
      CREATE INDEX IF NOT EXISTS ix_alerta_abierta ON alerta_territorial (id_municipio) WHERE estatus = 'abierta';

      CREATE TABLE IF NOT EXISTS acceso_expediente (
        id_acceso bigserial PRIMARY KEY,
        id_usuario integer NOT NULL REFERENCES usuario(id_usuario),
        id_reporte integer,
        folio varchar(32),
        accion varchar(12) NOT NULL CHECK (accion IN ('ver', 'exportar', 'foto')),
        detalle varchar(300),
        fecha timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS ix_acceso_fecha ON acceso_expediente (fecha);
      CREATE OR REPLACE FUNCTION acceso_expediente_solo_insercion() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'acceso_expediente es append-only'; END $$;
      DROP TRIGGER IF EXISTS tr_acceso_expediente_solo_insercion ON acceso_expediente;
      CREATE TRIGGER tr_acceso_expediente_solo_insercion BEFORE UPDATE OR DELETE ON acceso_expediente
        FOR EACH ROW EXECUTE FUNCTION acceso_expediente_solo_insercion();
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE IF EXISTS acceso_expediente;
      DROP FUNCTION IF EXISTS acceso_expediente_solo_insercion();
      DROP TABLE IF EXISTS alerta_territorial;
      DROP TABLE IF EXISTS configuracion;
      ALTER TABLE seguimiento DROP CONSTRAINT IF EXISTS ck_seguimiento_tipo;
      ALTER TABLE seguimiento DROP COLUMN IF EXISTS tipo;
      DROP INDEX IF EXISTS ix_reporte_duplicado_de;
      ALTER TABLE reporte DROP COLUMN IF EXISTS duplicado_de;
      DROP INDEX IF EXISTS ix_caso_fecha_seguimiento;
      ALTER TABLE caso DROP CONSTRAINT IF EXISTS ck_caso_verificacion, DROP CONSTRAINT IF EXISTS ck_caso_nna;
      ALTER TABLE caso DROP COLUMN IF EXISTS id_responsable, DROP COLUMN IF EXISTS id_dependencia, DROP COLUMN IF EXISTS fecha_seguimiento,
        DROP COLUMN IF EXISTS resultado, DROP COLUMN IF EXISTS fecha_cierre, DROP COLUMN IF EXISTS id_modalidad, DROP COLUMN IF EXISTS verificacion,
        DROP COLUMN IF EXISTS nna_identificados, DROP COLUMN IF EXISTS nna_canalizados, DROP COLUMN IF EXISTS nna_ninas, DROP COLUMN IF EXISTS nna_ninos;
      DROP TABLE IF EXISTS modalidad;
      DROP TABLE IF EXISTS dependencia;
      DROP TABLE IF EXISTS asignacion_municipio;
      DELETE FROM rol_usuario r WHERE r.nombre = 'Coordinador regional' AND NOT EXISTS (SELECT 1 FROM usuario u WHERE u.id_rol = r.id_rol);
    `);
  }
}
