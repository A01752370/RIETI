/**
 * Pruebas de punta a punta del API contra PostgreSQL + PostGIS reales.
 *
 * Se usa el módulo real (rutas, guard, validación, migraciones, filtro de errores);
 * lo único simulado es el verificador de JWT de Cognito, sustituido por un doble
 * que acepta tres tokens de prueba. Se omiten si no hay base de datos
 * (`E2E_DB_PORT` sin definir). En CI corren con un contenedor `postgis/postgis`.
 *
 * Cada grupo de peticiones usa una IP distinta (X-Forwarded-For) para que el
 * límite de tasa por IP no interfiera entre pruebas.
 */
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

const HAY_BD = Boolean(process.env.E2E_DB_PORT);
/** Con E2E_COMO_RIETI_APP=1 el API se conecta con el rol de mínimo privilegio (infra/sql). */
const COMO_RIETI_APP = process.env.E2E_COMO_RIETI_APP === '1';
const describeBd = HAY_BD ? describe : describe.skip;

const BD = 'rieti_e2e';
const SUB_PERSONAL = '11111111-1111-4111-8111-111111111111';
const SUB_SIN_ROL = '22222222-2222-4222-8222-222222222222';
const SUB_INACTIVO = '33333333-3333-4333-8333-333333333333';

/** Doble del verificador de Cognito: solo conoce estos tokens. */
const TOKENS: Record<string, { sub: string; 'cognito:groups'?: string[] }> = {
  'token-personal': { sub: SUB_PERSONAL, 'cognito:groups': ['PersonalSIPINNA'] },
  'token-sin-rol': { sub: SUB_SIN_ROL, 'cognito:groups': [] },
  'token-inactivo': { sub: SUB_INACTIVO, 'cognito:groups': ['PersonalSIPINNA'] },
};

let siguienteIp = 1;
/** IP de cliente distinta por grupo de peticiones. */
const nuevaIp = () => `203.0.113.${siguienteIp++}, 127.0.0.1`;

const reporteValido = () => ({
  ubicacion: 'Av. López Mateos, crucero con Calle 5',
  latitud: 19.5594,
  longitud: -99.2512,
  cantidadNinos: 2,
  edadAproximada: '6-11',
  actividad: 'Venta ambulante',
  situacionRiesgo: 'No sé',
  descripcion: 'Dos menores vendiendo dulces entre los autos durante la tarde.',
  avisoPrivacidadVersion: '2026-10-v1',
});

describeBd('API RIETI (e2e)', () => {
  let app: NestExpressApplication;
  let ds: DataSource;
  /** Conexión con el usuario maestro, para preparar datos y probar el script de administración. */
  let adminDs: DataSource;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    Object.assign(process.env, {
      DB_HOST: process.env.E2E_DB_HOST ?? '127.0.0.1',
      DB_PORT: process.env.E2E_DB_PORT,
      DB_USERNAME: process.env.E2E_DB_USER ?? 'postgres',
      DB_PASSWORD: process.env.E2E_DB_PASSWORD ?? '',
      DB_NAME: BD,
      DB_SSL: 'false',
      COGNITO_USER_POOL_ID: 'mx-central-1_E2E',
      COGNITO_CLIENT_ID: 'cliente-e2e',
      TRUST_PROXY_HOPS: '2',
    });

    const admin = await new DataSource({
      type: 'postgres', host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: 'postgres',
    }).initialize();
    await admin.query(`DROP DATABASE IF EXISTS ${BD} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${BD}`);
    await admin.destroy();

    adminDs = await new DataSource({
      type: 'postgres', host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: BD,
    }).initialize();
    if (COMO_RIETI_APP) {
      // Migraciones con el usuario maestro y luego el rol limitado, como en el runbook.
      const { opcionesTypeOrm } = await import('../../src/config/typeorm.config');
      const mig = await new DataSource({ ...opcionesTypeOrm(), migrationsRun: false }).initialize();
      await mig.runMigrations();
      await mig.destroy();
      const { readFileSync } = await import('fs');
      await adminDs.query(readFileSync(`${__dirname}/../../../infra/sql/01-rol-rieti-app.sql`, 'utf8'));
      await adminDs.query("ALTER ROLE rieti_app LOGIN PASSWORD 'solo-e2e-local'");
      Object.assign(process.env, { DB_USERNAME: 'rieti_app', DB_PASSWORD: 'solo-e2e-local', DB_MIGRAR_AL_INICIAR: 'false' });
    }

    // Imports diferidos: las opciones de TypeORM y Cognito se leen del entorno recién configurado.
    const { AppModule } = await import('../../src/app.module');
    const { VERIFICADOR_JWT } = await import('../../src/auth/jwt.guard');
    const { configurarApp } = await import('../../src/configurar-app');

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICADOR_JWT)
      .useValue({
        verify: async (t: string) => {
          if (!TOKENS[t]) throw new Error('token inválido');
          return TOKENS[t];
        },
      })
      .compile();
    app = modulo.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
    configurarApp(app);
    await app.init(); // corre las migraciones
    ds = app.get(DataSource);

    const rol = async (nombre: string) =>
      (await adminDs.query('SELECT id_rol FROM rol_usuario WHERE nombre = $1', [nombre]))[0].id_rol;
    const personal = await rol('Personal SIPINNA');
    await adminDs.query(
      `INSERT INTO usuario (correo, cognito_sub, id_rol, activo) VALUES
       ('enlace@ejemplo.mx', $1, $4, true), ('sinrol@ejemplo.mx', $2, $5, true), ('baja@ejemplo.mx', $3, $4, false)`,
      [SUB_PERSONAL, SUB_SIN_ROL, SUB_INACTIVO, personal, await rol('Ciudadano')]);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await adminDs?.destroy();
  });

  describe('rutas públicas', () => {
    it('health responde fuera del prefijo /api/v1', async () => {
      await http().get('/health').expect(200, { estado: 'ok' });
      await http().get('/health/ready').expect(200);
    });

    it('catálogos con los estatus canónicos de la Etapa 1', async () => {
      const r = await http().get('/api/v1/catalogos').expect(200);
      expect(r.body.estatus).toEqual(['Recibido', 'En revisión', 'En atención', 'Canalizado', 'Concluido', 'Descartado']);
      expect(r.body.actividades).toContain('Venta ambulante');
    });

    it('la migración dejó el catálogo de estatus en la BD igual que el código', async () => {
      const filas = await ds.query('SELECT nombre FROM estatus_reporte ORDER BY orden');
      expect(filas.map((f: { nombre: string }) => f.nombre))
        .toEqual(['Recibido', 'En revisión', 'En atención', 'Canalizado', 'Concluido', 'Descartado']);
    });

    it('aviso de privacidad vigente', async () => {
      const r = await http().get('/api/v1/avisos-privacidad/vigente').expect(200);
      expect(r.body.version).toBe('2026-10-v1');
      expect(r.body.parrafos.length).toBeGreaterThan(0);
    });

    it('las rutas viejas sin prefijo ya no existen', async () => {
      await http().get('/reportes/folio/RIETI-2026-000001').expect(404);
    });
  });

  describe('registro y consulta ciudadana (folio + clave)', () => {
    let folio: string;
    let clave: string;

    it('crea un reporte anónimo y devuelve folio y clave', async () => {
      const r = await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp()).send(reporteValido()).expect(201);
      expect(r.body.folio).toMatch(/^RIETI-\d{4}-\d{6}$/);
      expect(r.body.claveConsulta).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(r.body.estatus).toBe('Recibido');
      expect(Object.keys(r.body).sort()).toEqual(['claveConsulta', 'estatus', 'fechaCreacion', 'folio']);
      ({ folio, claveConsulta: clave } = r.body);
    });

    it('en la BD solo queda el hash Argon2id de la clave', async () => {
      const [fila] = await ds.query(
        `SELECT r.clave_consulta_hash AS h, r.aviso_privacidad_version AS v
         FROM reporte r JOIN folio f ON f.id_reporte = r.id_reporte WHERE f.codigo = $1`, [folio]);
      expect(fila.h).toMatch(/^\$argon2id\$/);
      expect(fila.h).not.toContain(clave.replace(/-/g, ''));
      expect(fila.v).toBe('2026-10-v1');
    });

    it('el esquema no tiene columnas de IP ni de dispositivo (RNF-29)', async () => {
      const cols: { column_name: string }[] = await ds.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name IN ('reporte', 'ubicacion', 'folio', 'caso', 'seguimiento')`);
      const nombres = cols.map((c) => c.column_name);
      expect(nombres.filter((n) => /(^|_)ip(_|$)|dispositivo|device|imei|publicidad/i.test(n))).toEqual([]);
    });

    it('consulta con folio + clave: solo estatus y fechas', async () => {
      const r = await http().post('/api/v1/reportes/consulta').set('X-Forwarded-For', nuevaIp())
        .send({ folio: folio.toLowerCase(), clave: clave.toLowerCase() }).expect(200);
      expect(r.body.estatus).toBe('Recibido');
      expect(r.body.historial).toEqual([{ estatus: 'Recibido', fecha: expect.any(String) }]);
      expect(Object.keys(r.body).sort()).toEqual(['estatus', 'fechaActualizacion', 'fechaCreacion', 'folio', 'historial']);
    });

    it('A1: clave incorrecta y folio inexistente dan la misma respuesta', async () => {
      const ip = nuevaIp();
      const mala = await http().post('/api/v1/reportes/consulta').set('X-Forwarded-For', ip)
        .send({ folio, clave: 'AAAA-BBBB-CCCC' }).expect(404);
      const inexistente = await http().post('/api/v1/reportes/consulta').set('X-Forwarded-For', ip)
        .send({ folio: 'RIETI-2026-999999', clave }).expect(404);
      expect(mala.body).toEqual({ codigo: 'FOLIO_O_CLAVE_INCORRECTOS', mensaje: 'El folio o la clave no son correctos' });
      expect(inexistente.body).toEqual(mala.body);
    });

    it('A1: tras 5 fallos el folio se bloquea aunque cambie la IP, y ni la clave correcta pasa', async () => {
      const otro = await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp()).send(reporteValido()).expect(201);
      for (let i = 0; i < 5; i++) {
        await http().post('/api/v1/reportes/consulta').set('X-Forwarded-For', nuevaIp())
          .send({ folio: otro.body.folio, clave: 'AAAA-BBBB-CCCC' }).expect(404);
      }
      const r = await http().post('/api/v1/reportes/consulta').set('X-Forwarded-For', nuevaIp())
        .send({ folio: otro.body.folio, clave: otro.body.claveConsulta }).expect(429);
      expect(r.body.codigo).toBe('DEMASIADOS_INTENTOS');
    });

    it('A5: un folio con inyección SQL se rechaza en la validación', async () => {
      const r = await http().post('/api/v1/reportes/consulta').set('X-Forwarded-For', nuevaIp())
        .send({ folio: "RIETI-2026-000001' OR '1'='1", clave }).expect(400);
      expect(r.body.codigo).toBe('SOLICITUD_INVALIDA');
    });
  });

  describe('validación de entrada', () => {
    it('rechaza campos no permitidos (p. ej. un identificador de dispositivo)', async () => {
      const r = await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp())
        .send({ ...reporteValido(), idDispositivo: 'abc-123' }).expect(400);
      expect(r.body.detalle.join(' ')).toContain('idDispositivo');
    });

    it('exige aceptar el aviso de privacidad vigente', async () => {
      const r = await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp())
        .send({ ...reporteValido(), avisoPrivacidadVersion: '2020-01-v0' }).expect(400);
      expect(r.body.detalle).toContain('Debes aceptar el aviso de privacidad vigente');
    });

    it('rechaza valores fuera de catálogo', async () => {
      const r = await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp())
        .send({ ...reporteValido(), actividad: 'Inventada' }).expect(400);
      expect(r.body.codigo).toBe('VALOR_NO_VALIDO');
    });

    it('A22: rechaza cuerpos de más de 16 KB', async () => {
      await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp())
        .send({ ...reporteValido(), descripcion: 'x'.repeat(20_000) }).expect(413);
    });

    it('A9: el sexto reporte en un minuto desde la misma IP recibe 429', async () => {
      const ip = nuevaIp();
      const codigos: number[] = [];
      for (let i = 0; i < 6; i++) {
        codigos.push((await http().post('/api/v1/reportes').set('X-Forwarded-For', ip)
          .send({ ...reporteValido(), actividad: 'Inventada' })).status);
      }
      expect(codigos.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
      expect(codigos[5]).toBe(429);
    });
  });

  describe('autenticación y autorización del personal', () => {
    it('A2: sin token → 401 en todas las rutas del personal', async () => {
      await http().get('/api/v1/reportes').expect(401);
      await http().get('/api/v1/reportes/1').expect(401);
      await http().patch('/api/v1/reportes/1/estatus').send({ estatus: 'En revisión' }).expect(401);
      const r = await http().post('/api/v1/reportes/1/seguimientos').send({ comentario: 'x' }).expect(401);
      expect(r.body.codigo).toBe('NO_AUTENTICADO');
    });

    it('A11: token que no verifica → 401', async () => {
      await http().get('/api/v1/reportes').set('Authorization', 'Bearer token-inventado').expect(401);
      await http().get('/api/v1/reportes').set('Authorization', 'token-personal').expect(401);
    });

    it('A4: usuario sin grupo de personal → 403', async () => {
      await http().get('/api/v1/reportes').set('Authorization', 'Bearer token-sin-rol').expect(403);
    });

    it('usuario desactivado en la BD → 403 aunque su token sea válido', async () => {
      const r = await http().get('/api/v1/reportes').set('Authorization', 'Bearer token-inactivo').expect(403);
      expect(r.body.codigo).toBe('USUARIO_INACTIVO');
    });
  });

  describe('bandeja y seguimiento', () => {
    const auth = { Authorization: 'Bearer token-personal' };
    let id: number;
    let folio: string;
    let clave: string;

    beforeAll(async () => {
      const r = await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp()).send(reporteValido()).expect(201);
      ({ folio, claveConsulta: clave } = r.body);
    });

    it('lista los reportes del más reciente al más antiguo, con paginación', async () => {
      const r = await http().get('/api/v1/reportes?tamano=2').set(auth).expect(200);
      expect(r.body.pagina).toBe(1);
      expect(r.body.tamano).toBe(2);
      expect(r.body.total).toBeGreaterThanOrEqual(3);
      expect(r.body.elementos).toHaveLength(2);
      expect(r.body.elementos[0].folio).toBe(folio);
      id = r.body.elementos[0].id;
    });

    it('rechaza un filtro de estatus fuera de catálogo', async () => {
      await http().get('/api/v1/reportes?estatus=Cerrado').set(auth).expect(400);
    });

    it('detalle con bitácora y transiciones permitidas', async () => {
      const r = await http().get(`/api/v1/reportes/${id}`).set(auth).expect(200);
      expect(r.body.descripcion).toContain('Dos menores');
      expect(r.body.latitud).toBeCloseTo(19.5594);
      expect(r.body.transicionesPermitidas).toEqual(['En revisión', 'Descartado']);
      expect(r.body.historial).toEqual([{ estatus: 'Recibido', comentario: null, autor: null, fecha: expect.any(String) }]);
    });

    it('rechaza una transición inválida (Recibido → Concluido)', async () => {
      const r = await http().patch(`/api/v1/reportes/${id}/estatus`).set(auth).send({ estatus: 'Concluido' }).expect(422);
      expect(r.body.codigo).toBe('TRANSICION_INVALIDA');
    });

    it('descartar sin motivo → 422 MOTIVO_REQUERIDO', async () => {
      const r = await http().patch(`/api/v1/reportes/${id}/estatus`).set(auth).send({ estatus: 'Descartado' }).expect(422);
      expect(r.body.codigo).toBe('MOTIVO_REQUERIDO');
    });

    it('cambia a En revisión con comentario y registra al autor', async () => {
      const r = await http().patch(`/api/v1/reportes/${id}/estatus`).set(auth)
        .send({ estatus: 'En revisión', comentario: 'Se asigna a enlace municipal' }).expect(200);
      expect(r.body.estatus).toBe('En revisión');
      expect(r.body.transicionesPermitidas).toEqual(['En atención', 'Canalizado', 'Descartado']);
      expect(r.body.historial.at(-1)).toMatchObject({
        estatus: 'En revisión', comentario: 'Se asigna a enlace municipal', autor: 'enlace@ejemplo.mx',
      });
    });

    it('agrega una nota sin cambiar el estatus', async () => {
      const r = await http().post(`/api/v1/reportes/${id}/seguimientos`).set(auth)
        .send({ comentario: 'Se programa recorrido' }).expect(201);
      expect(r.body.estatus).toBe('En revisión');
      expect(r.body.historial).toHaveLength(3);
    });

    it('filtra la bandeja por estatus', async () => {
      const r = await http().get(`/api/v1/reportes?estatus=${encodeURIComponent('En revisión')}`).set(auth).expect(200);
      expect(r.body.elementos.map((e: { id: number }) => e.id)).toEqual([id]);
    });

    it('el ciudadano ve el nuevo estatus, pero no los comentarios internos', async () => {
      const r = await http().post('/api/v1/reportes/consulta').set('X-Forwarded-For', nuevaIp())
        .send({ folio, clave }).expect(200);
      expect(r.body.estatus).toBe('En revisión');
      expect(r.body.historial.map((e: { estatus: string }) => e.estatus)).toEqual(['Recibido', 'En revisión']);
      expect(JSON.stringify(r.body)).not.toMatch(/enlace|recorrido|asigna/);
    });

    it('descarta con motivo y queda terminal', async () => {
      const r = await http().patch(`/api/v1/reportes/${id}/estatus`).set(auth)
        .send({ estatus: 'Descartado', motivo: 'Reporte duplicado' }).expect(200);
      expect(r.body.motivoDescarte).toBe('Reporte duplicado');
      expect(r.body.transicionesPermitidas).toEqual([]);
      await http().patch(`/api/v1/reportes/${id}/estatus`).set(auth).send({ estatus: 'En revisión' }).expect(422);
    });

    it('404 con formato único para un reporte inexistente', async () => {
      const r = await http().get('/api/v1/reportes/999999').set(auth).expect(404);
      expect(r.body).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'Reporte no encontrado' });
    });

    it('A21: la bitácora es solo de inserción', async () => {
      // Con el usuario maestro lo frena el trigger; con rieti_app, además, la falta de permisos.
      const rechazo = COMO_RIETI_APP ? /permission denied/ : /append-only/;
      await expect(ds.query('UPDATE seguimiento SET comentario = $1', ['alterado'])).rejects.toThrow(rechazo);
      await expect(ds.query('DELETE FROM seguimiento')).rejects.toThrow(rechazo);
      await expect(adminDs.query('DELETE FROM seguimiento')).rejects.toThrow(/append-only/);
    });

    (COMO_RIETI_APP ? it : it.skip)('D-08: rieti_app no puede borrar reportes ni cambiar el esquema', async () => {
      await expect(ds.query('DELETE FROM reporte')).rejects.toThrow(/permission denied/);
      await expect(ds.query("UPDATE reporte SET descripcion = 'x'")).rejects.toThrow(/permission denied/);
      await expect(ds.query('CREATE TABLE intruso (x int)')).rejects.toThrow(/permission denied/);
    });
  });

  describe('script de administración borrar-reporte', () => {
    it('borra un reporte con su bitácora y deja el trigger activo', async () => {
      const { borrarReportePorFolio } = await import('../../src/scripts/borrar-reporte');
      const r = await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp()).send(reporteValido()).expect(201);
      const antes = Number((await ds.query('SELECT count(*) AS n FROM reporte'))[0].n);

      const res = await adminDs.transaction((m) => borrarReportePorFolio(m, r.body.folio));
      expect(res).toEqual({ folio: r.body.folio, casos: 1, seguimientos: 1 });
      expect(Number((await ds.query('SELECT count(*) AS n FROM reporte'))[0].n)).toBe(antes - 1);
      expect(await ds.query('SELECT 1 FROM folio WHERE codigo = $1', [r.body.folio])).toEqual([]);

      // El trigger volvió a quedar activo.
      await expect(adminDs.query('DELETE FROM seguimiento')).rejects.toThrow(/append-only/);
    });

    it('si el folio no existe no cambia nada', async () => {
      const { borrarReportePorFolio } = await import('../../src/scripts/borrar-reporte');
      await expect(adminDs.transaction((m) => borrarReportePorFolio(m, 'RIETI-2026-999999'))).rejects.toThrow(/No existe/);
      await expect(adminDs.query('DELETE FROM seguimiento')).rejects.toThrow(/append-only/);
    });
  });
});
