-- =============================================================================
-- RIETI — Rol de base de datos de mínimo privilegio para el API (D-08, A3/A5)
-- =============================================================================
-- ESTADO: preparado y probado en local; NO aplicado en AWS. Ver docs/RUNBOOK-AWS.md
-- (sección opcional) y docs/seguridad/metodos-proteccion.md.
--
-- Qué hace:
--   * Crea el rol `rieti_app` SIN LOGIN (el inicio de sesión se habilita aparte,
--     con contraseña en Secrets Manager o con autenticación IAM de RDS).
--   * Solo concede lo que el API usa en tiempo de ejecución: lectura de catálogos,
--     inserción de reportes y bitácora, y actualización de estatus.
--   * Sin DDL, sin DELETE, sin TRUNCATE, sin BYPASSRLS, sin UPDATE en la bitácora.
--   * Las migraciones siguen corriendo con el usuario maestro (rieti_admin).
--
-- Se ejecuta como el usuario maestro, conectado a rieti_db. Es idempotente.
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rieti_app') THEN
    CREATE ROLE rieti_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM rieti_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO rieti_app;

-- Catálogos: solo lectura.
GRANT SELECT ON municipio, rol_usuario, actividad, riesgo, rango_edad, estatus_reporte TO rieti_app;

-- Geografía (Fase 2): polígonos del INEGI y catálogo opcional de códigos postales, solo lectura.
GRANT SELECT ON municipio_geom, codigo_postal_municipio TO rieti_app;

-- Personal: el login sincroniza correo/rol/sub; nunca se borra.
GRANT SELECT, INSERT ON usuario TO rieti_app;
GRANT UPDATE (correo, cognito_sub, id_rol) ON usuario TO rieti_app;

-- Reportes: alta y lectura; solo se actualiza la fecha de actualización.
GRANT SELECT, INSERT ON ubicacion, reporte, folio, reporte_caso TO rieti_app;
-- Menores por grupo de edad (Fase 2): se insertan con el reporte y no se modifican.
GRANT SELECT, INSERT ON reporte_menores_grupo TO rieti_app;
GRANT UPDATE (fecha_actualizacion) ON reporte TO rieti_app;

-- Caso: estatus vigente y motivo de descarte.
GRANT SELECT, INSERT ON caso TO rieti_app;
GRANT UPDATE (id_estatus, motivo_descarte, fecha_actualizacion) ON caso TO rieti_app;

-- Bitácora: solo inserción (además del trigger append-only).
GRANT SELECT, INSERT ON seguimiento TO rieti_app;

-- Directorio de la red de municipios (D-17): datos institucionales, sin PII. El administrador
-- reemplaza la lista de un municipio, por eso aquí sí hay DELETE.
GRANT SELECT, INSERT, DELETE ON contacto_municipio TO rieti_app;

-- Cuentas opcionales de ciudadano (Fase 4): solo sub de Cognito y fechas. Eliminar la cuenta
-- borra la fila (el reporte se conserva, desvinculado por ON DELETE SET NULL).
GRANT SELECT, INSERT, DELETE ON cuentas_ciudadano TO rieti_app;
GRANT UPDATE (ultimo_acceso) ON cuentas_ciudadano TO rieti_app;
GRANT UPDATE (cuenta_ciudadano_id) ON reporte TO rieti_app;

-- Consecutivo de folios.
GRANT SELECT, INSERT, UPDATE ON folio_contador TO rieti_app;

-- Fase 7: expediente y control territorial. El Administrador da de alta y renombra
-- dependencias (nunca se borran: se desactivan para no romper expedientes).
GRANT SELECT ON modalidad TO rieti_app;
GRANT SELECT, INSERT ON dependencia TO rieti_app;
GRANT UPDATE (nombre, activo) ON dependencia TO rieti_app;
GRANT SELECT, INSERT, DELETE ON asignacion_municipio TO rieti_app;
GRANT UPDATE (id_responsable, id_dependencia, fecha_seguimiento, resultado, fecha_cierre, id_modalidad, verificacion,
  nna_identificados, nna_canalizados, nna_ninas, nna_ninos) ON caso TO rieti_app;
GRANT UPDATE (duplicado_de) ON reporte TO rieti_app;
GRANT SELECT, UPDATE ON configuracion TO rieti_app;
GRANT SELECT, INSERT, UPDATE ON alerta_territorial TO rieti_app;
-- Bitácora de accesos: solo lectura e inserción (además, un trigger rechaza UPDATE/DELETE).
GRANT SELECT, INSERT ON acceso_expediente TO rieti_app;

-- Fase 8: referencias a las fotos (el objeto vive en S3). Sin UPDATE ni DELETE.
GRANT SELECT, INSERT ON foto_reporte TO rieti_app;

-- Secuencias de las llaves serial.

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO rieti_app;

-- La tabla de control de migraciones solo la toca el usuario maestro.
REVOKE ALL ON migrations FROM rieti_app;
