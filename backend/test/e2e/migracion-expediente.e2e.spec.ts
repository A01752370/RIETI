/**
 * La migración ExpedienteTerritorial (Fase 7) sobre una base con datos, como la de
 * producción: personal existente y un reporte con su caso. Se prueba aplicar
 * (asignaciones iniciales y valores por omisión), re-aplicar y revertir.
 */
import { DataSource, QueryRunner } from 'typeorm';
import { EsquemaInicial1760000000000 } from '../../src/database/migrations/1760000000000-EsquemaInicial';
import { ClaveConsultaYEstatus1760100000000 } from '../../src/database/migrations/1760100000000-ClaveConsultaYEstatus';
import { MunicipiosYRed1760200000000 } from '../../src/database/migrations/1760200000000-MunicipiosYRed';
import { FormularioYGeografia1760300000000 } from '../../src/database/migrations/1760300000000-FormularioYGeografia';
import { CuentasCiudadano1760400000000 } from '../../src/database/migrations/1760400000000-CuentasCiudadano';
import { AlineacionSocio1760500000000 } from '../../src/database/migrations/1760500000000-AlineacionSocio';
import { ExpedienteTerritorial1760600000000 } from '../../src/database/migrations/1760600000000-ExpedienteTerritorial';

const describeBd = process.env.E2E_DB_PORT ? describe : describe.skip;
const BD = 'rieti_e2e_migracion_expediente';
const ANTERIORES = [EsquemaInicial1760000000000, ClaveConsultaYEstatus1760100000000, MunicipiosYRed1760200000000,
  FormularioYGeografia1760300000000, CuentasCiudadano1760400000000, AlineacionSocio1760500000000];

describeBd('migración ExpedienteTerritorial sobre una base con datos', () => {
  const conexion = (database: string, migrations: Function[] = []) => new DataSource({
    type: 'postgres', host: process.env.E2E_DB_HOST ?? '127.0.0.1', port: Number(process.env.E2E_DB_PORT),
    username: process.env.E2E_DB_USER ?? 'postgres', password: process.env.E2E_DB_PASSWORD ?? '', database, migrations,
  });
  let ds: DataSource;
  let q: QueryRunner;
  const uno = async (sql: string) => Number((await ds.query(sql))[0].n);

  beforeAll(async () => {
    const admin = await conexion('postgres').initialize();
    await admin.query(`DROP DATABASE IF EXISTS ${BD} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${BD}`);
    await admin.destroy();

    // Producción antes de la Fase 7: un enlace con municipio, otro sin él, un administrador y un reporte con caso.
    const previo = await conexion(BD, ANTERIORES).initialize();
    await previo.runMigrations();
    await previo.query(`
      INSERT INTO usuario (correo, cognito_sub, id_rol, id_municipio) VALUES
        ('enlace-con@ejemplo.mx', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', (SELECT id_rol FROM rol_usuario WHERE nombre = 'Personal SIPINNA'),
          (SELECT id_municipio FROM municipio WHERE clave_inegi = '15057')),
        ('enlace-sin@ejemplo.mx', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', (SELECT id_rol FROM rol_usuario WHERE nombre = 'Personal SIPINNA'), NULL),
        ('admin@ejemplo.mx', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', (SELECT id_rol FROM rol_usuario WHERE nombre = 'Administrador'), NULL);
      INSERT INTO ubicacion (descripcion, latitud, longitud) VALUES ('Referencia de prueba', 19.5594, -99.2512);
      INSERT INTO reporte (id_ubicacion, id_actividad, id_riesgo, id_rango_edad, cantidad_ninos, descripcion, id_municipio)
        VALUES (1, 1, 1, 1, 1, 'Reporte previo', 1);
      INSERT INTO caso (id_estatus) VALUES ((SELECT id_estatus FROM estatus_reporte WHERE nombre = 'Recibido'));
      INSERT INTO reporte_caso (id_reporte, id_caso) VALUES (1, 1);`);
    await previo.destroy();

    ds = await conexion(BD, [...ANTERIORES, ExpedienteTerritorial1760600000000]).initialize();
    q = ds.createQueryRunner();
  }, 180_000);

  afterAll(async () => {
    await q?.release();
    await ds?.destroy();
  });

  it('se aplica sin tocar los datos: asigna a cada enlace su municipio (o Atizapán) y no al administrador', async () => {
    const aplicadas = await ds.runMigrations();
    expect(aplicadas.map((m) => m.name)).toEqual(['ExpedienteTerritorial1760600000000']);
    const asignaciones = await ds.query(
      `SELECT u.correo, m.clave_inegi FROM asignacion_municipio a JOIN usuario u ON u.id_usuario = a.id_usuario
       JOIN municipio m ON m.id_municipio = a.id_municipio ORDER BY u.correo`);
    expect(asignaciones).toEqual([
      { correo: 'enlace-con@ejemplo.mx', clave_inegi: '15057' },
      { correo: 'enlace-sin@ejemplo.mx', clave_inegi: '15013' },
    ]);
    expect(await ds.query('SELECT verificacion, resultado, fecha_cierre FROM caso WHERE id_caso = 1'))
      .toEqual([{ verificacion: 'Sin verificar', resultado: null, fecha_cierre: null }]);
    expect(await ds.query('SELECT descripcion, duplicado_de FROM reporte WHERE id_reporte = 1'))
      .toEqual([{ descripcion: 'Reporte previo', duplicado_de: null }]);
    expect(await uno("SELECT count(*) AS n FROM rol_usuario WHERE nombre = 'Coordinador regional' AND es_personal")).toBe(1);
    expect(await uno("SELECT valor AS n FROM configuracion WHERE clave = 'alerta_minimo'")).toBe(3);
  });

  it('es idempotente: correrla otra vez no duplica nada', async () => {
    await new ExpedienteTerritorial1760600000000().up(q);
    expect(await uno('SELECT count(*) AS n FROM asignacion_municipio')).toBe(2);
    expect(await uno('SELECT count(*) AS n FROM dependencia')).toBe(5);
    expect(await uno('SELECT count(*) AS n FROM configuracion')).toBe(6);
    expect(await uno("SELECT count(*) AS n FROM rol_usuario WHERE nombre = 'Coordinador regional'")).toBe(1);
  });

  it('se revierte conservando el reporte y el caso, y se puede volver a aplicar', async () => {
    await ds.undoLastMigration();
    expect(await uno(`SELECT count(*) AS n FROM information_schema.tables
      WHERE table_name IN ('asignacion_municipio', 'dependencia', 'modalidad', 'configuracion', 'alerta_territorial', 'acceso_expediente')`)).toBe(0);
    expect(await uno("SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'caso' AND column_name = 'verificacion'")).toBe(0);
    expect(await ds.query('SELECT descripcion FROM reporte WHERE id_reporte = 1')).toEqual([{ descripcion: 'Reporte previo' }]);
    expect(await uno('SELECT count(*) AS n FROM caso')).toBe(1);

    await ds.runMigrations();
    expect(await uno('SELECT count(*) AS n FROM asignacion_municipio')).toBe(2);
  });
});
