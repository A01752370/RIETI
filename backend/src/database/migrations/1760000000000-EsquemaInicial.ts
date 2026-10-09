import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial (ER Etapa 2) + catálogos. Sustituye a `synchronize: true`.
 * Los nombres de tablas/columnas deben coincidir con las entidades.
 */
export class EsquemaInicial1760000000000 implements MigrationInterface {
  name = 'EsquemaInicial1760000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    // pgAudit (RNF-21) solo existe si el parameter group lo precarga (RDS); en local se omite.
    await q.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pgaudit')
           AND current_setting('shared_preload_libraries') LIKE '%pgaudit%' THEN
          CREATE EXTENSION IF NOT EXISTS pgaudit;
        END IF;
      END $$`);

    await q.query(`
      CREATE TABLE municipio (
        id_municipio serial PRIMARY KEY,
        nombre varchar(120) NOT NULL,
        estado varchar(80) NOT NULL
      );
      CREATE TABLE rol_usuario (
        id_rol serial PRIMARY KEY,
        nombre varchar(60) NOT NULL UNIQUE,
        es_personal boolean NOT NULL DEFAULT false
      );
      CREATE TABLE actividad (id_actividad serial PRIMARY KEY, nombre varchar(80) NOT NULL UNIQUE);
      CREATE TABLE riesgo (id_riesgo serial PRIMARY KEY, nombre varchar(20) NOT NULL UNIQUE);
      CREATE TABLE rango_edad (id_rango_edad serial PRIMARY KEY, nombre varchar(20) NOT NULL UNIQUE);
      CREATE TABLE estatus_reporte (
        id_estatus serial PRIMARY KEY,
        nombre varchar(40) NOT NULL UNIQUE,
        orden smallint NOT NULL
      );

      CREATE TABLE usuario (
        id_usuario serial PRIMARY KEY,
        correo varchar(254) NOT NULL UNIQUE,
        cognito_sub uuid NOT NULL UNIQUE,
        id_rol integer NOT NULL REFERENCES rol_usuario(id_rol),
        id_municipio integer REFERENCES municipio(id_municipio),
        activo boolean NOT NULL DEFAULT true,
        fecha_creacion timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE ubicacion (
        id_ubicacion serial PRIMARY KEY,
        descripcion varchar(300) NOT NULL,
        latitud numeric(10,7) CHECK (latitud BETWEEN -90 AND 90),
        longitud numeric(10,7) CHECK (longitud BETWEEN -180 AND 180),
        punto geography(Point, 4326) GENERATED ALWAYS AS (
          CASE WHEN latitud IS NOT NULL AND longitud IS NOT NULL
               THEN ST_SetSRID(ST_MakePoint(longitud::float8, latitud::float8), 4326)::geography
          END) STORED
      );
      CREATE INDEX ix_ubicacion_punto ON ubicacion USING GIST (punto);

      CREATE TABLE reporte (
        id_reporte serial PRIMARY KEY,
        id_ubicacion integer NOT NULL UNIQUE REFERENCES ubicacion(id_ubicacion),
        id_municipio integer REFERENCES municipio(id_municipio),
        id_actividad integer NOT NULL REFERENCES actividad(id_actividad),
        id_riesgo integer NOT NULL REFERENCES riesgo(id_riesgo),
        id_rango_edad integer NOT NULL REFERENCES rango_edad(id_rango_edad),
        cantidad_ninos smallint NOT NULL CHECK (cantidad_ninos > 0),
        descripcion text NOT NULL,
        fecha_creacion timestamptz NOT NULL DEFAULT now(),
        fecha_actualizacion timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX ix_reporte_fecha ON reporte (fecha_creacion DESC);

      CREATE TABLE folio_contador (anio smallint PRIMARY KEY, ultimo integer NOT NULL);
      CREATE TABLE folio (
        id_folio serial PRIMARY KEY,
        codigo varchar(32) NOT NULL UNIQUE,
        anio smallint NOT NULL,
        consecutivo integer NOT NULL,
        id_reporte integer NOT NULL UNIQUE REFERENCES reporte(id_reporte),
        UNIQUE (anio, consecutivo)
      );

      CREATE TABLE caso (
        id_caso serial PRIMARY KEY,
        id_estatus integer NOT NULL REFERENCES estatus_reporte(id_estatus),
        fecha_apertura timestamptz NOT NULL DEFAULT now(),
        fecha_actualizacion timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE reporte_caso (
        id_reporte integer NOT NULL REFERENCES reporte(id_reporte),
        id_caso integer NOT NULL REFERENCES caso(id_caso),
        PRIMARY KEY (id_reporte, id_caso)
      );
      CREATE INDEX ix_reporte_caso_caso ON reporte_caso (id_caso);

      CREATE TABLE seguimiento (
        id_seguimiento serial PRIMARY KEY,
        id_caso integer NOT NULL REFERENCES caso(id_caso),
        id_usuario integer REFERENCES usuario(id_usuario),
        id_estatus integer NOT NULL REFERENCES estatus_reporte(id_estatus),
        comentario text,
        fecha timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX ix_seguimiento_caso ON seguimiento (id_caso, fecha DESC);
    `);

    // Bitácora append-only: se rechaza cualquier UPDATE/DELETE sobre seguimiento.
    await q.query(`
      CREATE FUNCTION seguimiento_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'seguimiento es append-only'; END $$;
      CREATE TRIGGER tr_seguimiento_inmutable BEFORE UPDATE OR DELETE ON seguimiento
        FOR EACH ROW EXECUTE FUNCTION seguimiento_inmutable();
    `);

    await q.query(`
      INSERT INTO municipio (nombre, estado) VALUES ('Atizapán de Zaragoza', 'Estado de México');
      INSERT INTO rol_usuario (nombre, es_personal) VALUES
        ('Ciudadano', false), ('Personal SIPINNA', true), ('Administrador', true);
      INSERT INTO actividad (nombre) VALUES
        ('Mendicidad forzada'), ('Trabajo doméstico'), ('Venta ambulante'),
        ('Construcción'), ('Trabajo agrícola'), ('Otro');
      INSERT INTO riesgo (nombre) VALUES ('Sí'), ('No'), ('No sé');
      INSERT INTO rango_edad (nombre) VALUES ('0-5'), ('6-11'), ('12-17');
      INSERT INTO estatus_reporte (nombre, orden) VALUES
        ('Recibido', 1), ('En revisión', 2), ('Canalizado', 3), ('Atendido', 4), ('Cerrado', 5);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE IF EXISTS seguimiento, reporte_caso, caso, folio, folio_contador, reporte,
        ubicacion, usuario, estatus_reporte, rango_edad, riesgo, actividad, rol_usuario, municipio CASCADE;
      DROP FUNCTION IF EXISTS seguimiento_inmutable();
    `);
  }
}
