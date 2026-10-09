/**
 * La migración MunicipiosYRed sobre una base con datos, como la de producción:
 * se aplican solo las migraciones anteriores, se cargan datos (usuario ligado a
 * Atizapán, reporte con bitácora append-only) y luego se prueba aplicar,
 * re-aplicar (idempotencia) y revertir.
 */
import { DataSource, QueryRunner } from 'typeorm';
import { EsquemaInicial1760000000000 } from '../../src/database/migrations/1760000000000-EsquemaInicial';
import { ClaveConsultaYEstatus1760100000000 } from '../../src/database/migrations/1760100000000-ClaveConsultaYEstatus';
import { MunicipiosYRed1760200000000 } from '../../src/database/migrations/1760200000000-MunicipiosYRed';

const describeBd = process.env.E2E_DB_PORT ? describe : describe.skip;
const BD = 'rieti_e2e_migracion';

describeBd('migración MunicipiosYRed sobre una base con datos', () => {
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

    // Estado de producción antes del despliegue: solo las dos primeras migraciones.
    const previo = await conexion(BD, [EsquemaInicial1760000000000, ClaveConsultaYEstatus1760100000000]).initialize();
    await previo.runMigrations();
    await previo.query(`
      INSERT INTO usuario (correo, cognito_sub, id_rol, id_municipio)
        VALUES ('enlace@ejemplo.mx', '11111111-1111-4111-8111-111111111111', 2, 1);
      INSERT INTO ubicacion (descripcion) VALUES ('Referencia de prueba');
      INSERT INTO reporte (id_ubicacion, id_actividad, id_riesgo, id_rango_edad, cantidad_ninos, descripcion)
        VALUES (1, 1, 1, 1, 2, 'Reporte previo');
      INSERT INTO folio (codigo, anio, consecutivo, id_reporte) VALUES ('RIETI-2026-000001', 2026, 1, 1);
      INSERT INTO caso (id_estatus) VALUES (1);
      INSERT INTO reporte_caso (id_reporte, id_caso) VALUES (1, 1);
      INSERT INTO seguimiento (id_caso, id_estatus) VALUES (1, 1);`);
    await previo.destroy();

    ds = await conexion(BD, [EsquemaInicial1760000000000, ClaveConsultaYEstatus1760100000000, MunicipiosYRed1760200000000]).initialize();
    q = ds.createQueryRunner();
  }, 120_000);

  afterAll(async () => {
    await q?.release();
    await ds?.destroy();
  });

  it('se aplica sin tocar los datos existentes', async () => {
    const aplicadas = await ds.runMigrations();
    expect(aplicadas.map((m) => m.name)).toEqual(['MunicipiosYRed1760200000000']);
    expect(await uno('SELECT count(*) AS n FROM municipio')).toBe(125);
    expect(await ds.query('SELECT id_municipio, clave_inegi FROM municipio WHERE id_municipio = 1'))
      .toEqual([{ id_municipio: 1, clave_inegi: '15013' }]);
    expect(await ds.query("SELECT id_municipio FROM usuario WHERE correo = 'enlace@ejemplo.mx'")).toEqual([{ id_municipio: 1 }]);
    expect(await uno('SELECT count(*) AS n FROM reporte')).toBe(1);
    expect(await uno('SELECT count(*) AS n FROM seguimiento')).toBe(1);
    expect(await uno('SELECT count(*) AS n FROM contacto_municipio WHERE es_ejemplo')).toBe(2);
  });

  it('es idempotente: correrla otra vez no duplica nada', async () => {
    await new MunicipiosYRed1760200000000().up(q);
    expect(await uno('SELECT count(*) AS n FROM municipio')).toBe(125);
    expect(await uno('SELECT count(*) AS n FROM contacto_municipio')).toBe(2);
  });

  it('se revierte sin perder la fila de Atizapán ni las referencias, y se puede volver a aplicar', async () => {
    await ds.undoLastMigration();
    expect(await ds.query('SELECT id_municipio, nombre FROM municipio')).toEqual([{ id_municipio: 1, nombre: 'Atizapán de Zaragoza' }]);
    expect(await uno("SELECT count(*) AS n FROM information_schema.tables WHERE table_name = 'contacto_municipio'")).toBe(0);
    expect(await ds.query("SELECT id_municipio FROM usuario WHERE correo = 'enlace@ejemplo.mx'")).toEqual([{ id_municipio: 1 }]);
    expect(await uno('SELECT count(*) AS n FROM seguimiento')).toBe(1);

    await ds.runMigrations();
    expect(await uno('SELECT count(*) AS n FROM municipio')).toBe(125);
  });
});
