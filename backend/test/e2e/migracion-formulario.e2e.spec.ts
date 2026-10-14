/**
 * La migración FormularioYGeografia (Fase 2) sobre una base con datos, como la
 * de producción: se aplican las migraciones anteriores, se carga un reporte con
 * el formato anterior y luego se prueba aplicar, re-aplicar y revertir.
 */
import { DataSource, QueryRunner } from 'typeorm';
import { EsquemaInicial1760000000000 } from '../../src/database/migrations/1760000000000-EsquemaInicial';
import { ClaveConsultaYEstatus1760100000000 } from '../../src/database/migrations/1760100000000-ClaveConsultaYEstatus';
import { MunicipiosYRed1760200000000 } from '../../src/database/migrations/1760200000000-MunicipiosYRed';
import { FormularioYGeografia1760300000000 } from '../../src/database/migrations/1760300000000-FormularioYGeografia';

const describeBd = process.env.E2E_DB_PORT ? describe : describe.skip;
const BD = 'rieti_e2e_migracion_formulario';
const ANTERIORES = [EsquemaInicial1760000000000, ClaveConsultaYEstatus1760100000000, MunicipiosYRed1760200000000];

describeBd('migración FormularioYGeografia sobre una base con datos', () => {
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

    // Estado de producción antes de la Fase 2, con un reporte del formato anterior (3 menores de 6-11).
    const previo = await conexion(BD, ANTERIORES).initialize();
    await previo.runMigrations();
    await previo.query(`
      INSERT INTO ubicacion (descripcion, latitud, longitud) VALUES ('Referencia de prueba', 19.5594, -99.2512);
      INSERT INTO reporte (id_ubicacion, id_actividad, id_riesgo, id_rango_edad, cantidad_ninos, descripcion, id_municipio)
        VALUES (1, 1, 1, (SELECT id_rango_edad FROM rango_edad WHERE nombre = '6-11'), 3, 'Reporte previo', 1);`);
    await previo.destroy();

    ds = await conexion(BD, [...ANTERIORES, FormularioYGeografia1760300000000]).initialize();
    q = ds.createQueryRunner();
  }, 180_000);

  afterAll(async () => {
    await q?.release();
    await ds?.destroy();
  });

  it('se aplica sin tocar los datos y rellena un grupo por cada reporte existente', async () => {
    const aplicadas = await ds.runMigrations();
    expect(aplicadas.map((m) => m.name)).toEqual(['FormularioYGeografia1760300000000']);
    expect(await ds.query(`
      SELECT g.cantidad, re.nombre AS rango FROM reporte_menores_grupo g
      JOIN rango_edad re ON re.id_rango_edad = g.id_rango_edad WHERE g.id_reporte = 1`))
      .toEqual([{ cantidad: 3, rango: '6-11' }]);
    expect(await ds.query('SELECT cantidad_ninos, descripcion FROM reporte WHERE id_reporte = 1'))
      .toEqual([{ cantidad_ninos: 3, descripcion: 'Reporte previo' }]);
  });

  it('carga los 125 polígonos y ubican bien puntos conocidos', async () => {
    expect(await uno('SELECT count(*) AS n FROM municipio_geom')).toBe(125);
    expect(await uno('SELECT count(*) AS n FROM municipio_geom WHERE NOT ST_IsValid(geom)')).toBe(0);
    const donde = async (lng: number, lat: number) => (await ds.query(
      `SELECT m.clave_inegi FROM municipio_geom g JOIN municipio m USING (id_municipio)
       WHERE ST_Contains(g.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))`, [lng, lat])).map((r: { clave_inegi: string }) => r.clave_inegi);
    expect(await donde(-99.2512, 19.5594)).toEqual(['15013']); // Atizapán de Zaragoza
    expect(await donde(-99.6557, 19.2826)).toEqual(['15106']); // Toluca
    expect(await donde(-99.1332, 19.4326)).toEqual([]);        // Zócalo de la CDMX
  });

  it('amplía los catálogos con "Otro" al final y agrega "Sin determinar"', async () => {
    const actividades = (await ds.query('SELECT nombre FROM actividad ORDER BY orden, id_actividad')).map((r: { nombre: string }) => r.nombre);
    expect(actividades).toHaveLength(15);
    expect(actividades.at(-1)).toBe('Otro');
    expect(actividades).toContain('Reciclaje o pepena');
    expect(await uno("SELECT count(*) AS n FROM rango_edad WHERE nombre = 'Sin determinar'")).toBe(1);
    expect(await uno('SELECT count(*) AS n FROM codigo_postal_municipio')).toBe(0);
  });

  it('es idempotente: correrla otra vez no duplica nada', async () => {
    await new FormularioYGeografia1760300000000().up(q);
    expect(await uno('SELECT count(*) AS n FROM actividad')).toBe(15);
    expect(await uno('SELECT count(*) AS n FROM reporte_menores_grupo')).toBe(1);
    expect(await uno('SELECT count(*) AS n FROM municipio_geom')).toBe(125);
  });

  it('se revierte conservando el reporte y se puede volver a aplicar', async () => {
    await ds.undoLastMigration();
    expect(await uno("SELECT count(*) AS n FROM information_schema.tables WHERE table_name IN ('reporte_menores_grupo', 'municipio_geom')")).toBe(0);
    expect(await ds.query('SELECT cantidad_ninos FROM reporte WHERE id_reporte = 1')).toEqual([{ cantidad_ninos: 3 }]);
    expect(await uno('SELECT count(*) AS n FROM actividad')).toBe(6);

    await ds.runMigrations();
    expect(await uno('SELECT count(*) AS n FROM reporte_menores_grupo')).toBe(1);
  });
});
