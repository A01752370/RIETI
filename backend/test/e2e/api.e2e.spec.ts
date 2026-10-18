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
const SUB_ADMIN = '44444444-4444-4444-8444-444444444444';

/** Doble del verificador de Cognito: solo conoce estos tokens. */
const TOKENS: Record<string, { sub: string; 'cognito:groups'?: string[] }> = {
  'token-personal': { sub: SUB_PERSONAL, 'cognito:groups': ['PersonalSIPINNA'] },
  'token-sin-rol': { sub: SUB_SIN_ROL, 'cognito:groups': [] },
  'token-inactivo': { sub: SUB_INACTIVO, 'cognito:groups': ['PersonalSIPINNA'] },
  'token-admin': { sub: SUB_ADMIN, 'cognito:groups': ['Administrador'] },
};

/** Doble de la fuente geográfica externa: cuenta las llamadas y nunca sale a internet. */
const fuenteGeoFalsa = {
  llamadasReversa: 0,
  async reversa() {
    this.llamadasReversa++;
    return { address: { road: 'Avenida Adolfo López Mateos', house_number: '12', suburb: 'Centro', postcode: '52900' } };
  },
  async tesela() {
    return Buffer.from([0x89, 0x50, 0x4e, 0x47]); // cabecera PNG
  },
};

/** Doble del verificador del pool de CIUDADANOS: solo conoce estos tokens (distintos de los del personal). */
const TOKENS_CIUDADANO: Record<string, { sub: string }> = {
  'token-ciudadano-1': { sub: '55555555-5555-4555-8555-555555555555' },
  'token-ciudadano-2': { sub: '66666666-6666-4666-8666-666666666666' },
};

/** Doble del proveedor de cuentas (Cognito): registra llamadas y nunca sale a internet. */
const cuentasFalsas = {
  async registrar(correo: string) {
    if (correo === 'existe@ejemplo.mx') {
      const { ErrorCuenta } = await import('../../src/ciudadanos/proveedor-cuentas');
      throw new ErrorCuenta('YA_EXISTE');
    }
  },
  async confirmar() {}, async reenviarCodigo() {}, async olvideContrasena() {}, async restablecerContrasena() {},
  async iniciarSesion() { return { accessToken: 'token-ciudadano-1', refreshToken: 'refresh-de-prueba-1234567890', expiresIn: 3600 }; },
  async refrescar() { return { accessToken: 'token-ciudadano-1', expiresIn: 3600 }; },
  async cambiarContrasena() {}, async cerrarSesionGlobal() {},
  eliminados: 0,
  async eliminar() { this.eliminados++; },
  async correo() { return 'persona@ejemplo.mx'; },
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
  municipioId: 1, // Atizapán de Zaragoza (15013): conserva el id 1 tras la migración
  avisoPrivacidadVersion: '2026-10-v3',
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
    const { FUENTE_GEO } = await import('../../src/geo/fuente-geo');
    const { VERIFICADOR_JWT_CIUDADANO } = await import('../../src/auth/jwt.guard');
    const { PROVEEDOR_CUENTAS } = await import('../../src/ciudadanos/proveedor-cuentas');
    const { configurarApp } = await import('../../src/configurar-app');

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICADOR_JWT)
      .useValue({
        verify: async (t: string) => {
          if (!TOKENS[t]) throw new Error('token inválido');
          return TOKENS[t];
        },
      })
      .overrideProvider(FUENTE_GEO)
      .useValue(fuenteGeoFalsa)
      .overrideProvider(VERIFICADOR_JWT_CIUDADANO)
      .useValue({
        verify: async (t: string) => {
          if (!TOKENS_CIUDADANO[t]) throw new Error('token inválido');
          return TOKENS_CIUDADANO[t];
        },
      })
      .overrideProvider(PROVEEDOR_CUENTAS)
      .useValue(cuentasFalsas)
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
       ('enlace@ejemplo.mx', $1, $4, true), ('sinrol@ejemplo.mx', $2, $5, true), ('baja@ejemplo.mx', $3, $4, false),
       ('admin@ejemplo.mx', $6, $7, true)`,
      [SUB_PERSONAL, SUB_SIN_ROL, SUB_INACTIVO, personal, await rol('Ciudadano'), SUB_ADMIN, await rol('Administrador')]);
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
      expect(r.body.estatus).toEqual(['Recibido', 'En revisión', 'En atención', 'Canalizado', 'Concluido', 'Descartado', 'Archivado', 'Reincidente']);
      expect(r.body.actividades).toContain('Venta ambulante');
    });

    it('la migración dejó el catálogo de estatus en la BD igual que el código', async () => {
      const filas = await ds.query('SELECT nombre FROM estatus_reporte ORDER BY orden');
      expect(filas.map((f: { nombre: string }) => f.nombre))
        .toEqual(['Recibido', 'En revisión', 'En atención', 'Canalizado', 'Concluido', 'Descartado', 'Archivado', 'Reincidente']);
    });

    it('aviso de privacidad vigente', async () => {
      const r = await http().get('/api/v1/avisos-privacidad/vigente').expect(200);
      expect(r.body.version).toBe('2026-10-v3');
      expect(r.body.parrafos.length).toBeGreaterThan(0);
      // Secciones con título: mismo texto, mismo orden (las APK instaladas siguen leyendo `parrafos`).
      expect(r.body.secciones.flatMap((s: { parrafos: string[] }) => s.parrafos)).toEqual(r.body.parrafos);
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
      expect(fila.v).toBe('2026-10-v3');
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
      expect(r.body.historial).toEqual([{ estatus: 'Recibido', etiqueta: 'Registrado', fecha: expect.any(String) }]);
      expect(Object.keys(r.body).sort()).toEqual(['estatus', 'estatusEtiqueta', 'fechaActualizacion', 'fechaCreacion', 'folio', 'historial']);
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
      expect(r.body.historial).toEqual([{ tipo: 'registro', estatus: 'Recibido', etiqueta: 'Registrado', comentario: null, autor: null, fecha: expect.any(String) }]);
      expect(r.body.fechaEstatusActual).toBe(r.body.historial[0].fecha);
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
        tipo: 'cambio', estatus: 'En revisión', comentario: 'Se asigna a enlace municipal', autor: 'enlace@ejemplo.mx',
      });
      expect(r.body.fechaEstatusActual).toBe(r.body.historial.at(-1).fecha);
    });

    it('agrega una nota sin cambiar el estatus', async () => {
      const r = await http().post(`/api/v1/reportes/${id}/seguimientos`).set(auth)
        .send({ comentario: 'Se programa recorrido' }).expect(201);
      expect(r.body.estatus).toBe('En revisión');
      expect(r.body.historial).toHaveLength(3);
      expect(r.body.historial.map((e: { tipo: string }) => e.tipo)).toEqual(['registro', 'cambio', 'nota']);
      // Una nota no cambia la fecha del estatus vigente.
      expect(r.body.fechaEstatusActual).toBe(r.body.historial[1].fecha);
    });

    it('filtra la bandeja por riesgo y por pendientes (Fase 5)', async () => {
      const pendientes = await http().get('/api/v1/reportes?pendientes=true&tamano=100').set(auth).expect(200);
      expect(pendientes.body.elementos.length).toBeGreaterThanOrEqual(1);
      expect(pendientes.body.elementos.every((e: { estatus: string }) => ['Recibido', 'En revisión'].includes(e.estatus))).toBe(true);
      const conRiesgo = await http().get(`/api/v1/reportes?riesgo=${encodeURIComponent('Sí')}&tamano=100`).set(auth).expect(200);
      expect(conRiesgo.body.elementos.every((e: { situacionRiesgo: string }) => e.situacionRiesgo === 'Sí')).toBe(true);
      await http().get('/api/v1/reportes?riesgo=Alto').set(auth).expect(400);
      await http().get('/api/v1/reportes?pendientes=quizas').set(auth).expect(400);
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

  describe('municipios (D-16)', () => {
    let atizapan: number;

    it('el catálogo tiene los 125 municipios con clave INEGI, en orden alfabético', async () => {
      const r = await http().get('/api/v1/catalogos/municipios').expect(200);
      expect(r.body).toHaveLength(125);
      expect(r.body.every((m: { clave: string }) => /^15\d{3}$/.test(m.clave))).toBe(true);
      const nombres = r.body.map((m: { nombre: string }) => m.nombre);
      expect(nombres).toEqual([...nombres].sort(new Intl.Collator('es', { sensitivity: 'base' }).compare));
      const fila = r.body.find((m: { clave: string }) => m.clave === '15013');
      expect(fila.nombre).toBe('Atizapán de Zaragoza');
      atizapan = fila.id;
    });

    it('la fila original de Atizapán se conservó (mismo id) y no hay duplicados', async () => {
      const filas = await adminDs.query("SELECT id_municipio, clave_inegi FROM municipio WHERE nombre = 'Atizapán de Zaragoza'");
      expect(filas).toEqual([{ id_municipio: 1, clave_inegi: '15013' }]);
      expect(atizapan).toBe(1);
    });

    it('acepta un reporte con municipio y lo guarda', async () => {
      const r = await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp())
        .send({ ...reporteValido(), municipioId: atizapan }).expect(201);
      const [fila] = await adminDs.query(
        'SELECT r.id_municipio FROM reporte r JOIN folio f ON f.id_reporte = r.id_reporte WHERE f.codigo = $1', [r.body.folio]);
      expect(fila.id_municipio).toBe(atizapan);
    });

    it('exige municipio: sin municipioId → 400 con mensaje en español', async () => {
      const { municipioId, ...sinMunicipio } = reporteValido();
      expect(municipioId).toBe(1);
      const r = await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp()).send(sinMunicipio).expect(400);
      expect(r.body.codigo).toBe('SOLICITUD_INVALIDA');
      expect(r.body.detalle).toContain('Elige el municipio donde ocurre');
    });

    it('rechaza municipioId no numérico o menor que 1', async () => {
      for (const valor of ['uno', 0, -3]) {
        const r = await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp())
          .send({ ...reporteValido(), municipioId: valor }).expect(400);
        expect(r.body.detalle).toContain('Elige el municipio donde ocurre');
      }
    });

    it('rechaza un municipio que no existe', async () => {
      const r = await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp())
        .send({ ...reporteValido(), municipioId: 99999 }).expect(400);
      expect(r.body).toEqual({ codigo: 'VALOR_NO_VALIDO', mensaje: 'El municipio seleccionado no es válido' });
    });

    it('la bandeja muestra y filtra por municipio', async () => {
      const r = await http().get('/api/v1/reportes?municipioId=' + atizapan).set('Authorization', 'Bearer token-personal').expect(200);
      expect(r.body.elementos.length).toBeGreaterThanOrEqual(1);
      expect(r.body.elementos.every((e: { municipio: string }) => e.municipio === 'Atizapán de Zaragoza')).toBe(true);
    });
  });

  describe('formulario robusto (Fase 2)', () => {
    /** Reporte con el formato nuevo: grupos de edad y dirección estructurada. */
    const reporteNuevo = () => {
      const { ubicacion, cantidadNinos, edadAproximada, ...resto } = reporteValido();
      expect([ubicacion, cantidadNinos, edadAproximada].every((v) => v !== undefined)).toBe(true);
      return {
        ...resto,
        actividad: 'Limpieza de parabrisas o actividades en cruceros',
        grupos: [{ rango: '0-5', cantidad: 2 }, { rango: '12-17', cantidad: 1 }],
        direccion: { calle: 'Av. López Mateos', numeroExterior: '12', colonia: 'Centro', codigoPostal: '52900', referencias: 'frente al mercado' },
      };
    };
    const enviar = (cuerpo: object) => http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp()).send(cuerpo);
    const idDe = async (folio: string) =>
      Number((await adminDs.query('SELECT id_reporte FROM folio WHERE codigo = $1', [folio]))[0].id_reporte);

    it('acepta grupos de edad (2 de 0-5 y 1 de 12-17) y dirección; deriva total, rango y texto de ubicación', async () => {
      const r = await enviar(reporteNuevo()).expect(201);
      const id = await idDe(r.body.folio);
      const d = await http().get(`/api/v1/reportes/${id}`).set('Authorization', 'Bearer token-personal').expect(200);
      expect(d.body.grupos).toEqual([{ rango: '0-5', cantidad: 2 }, { rango: '12-17', cantidad: 1 }]);
      expect(d.body.cantidadNinos).toBe(3);
      expect(d.body.edadAproximada).toBe('0-5');
      expect(d.body.ubicacion).toBe('Av. López Mateos 12, Col. Centro, C.P. 52900. Ref.: frente al mercado');
      expect(d.body.direccion).toEqual({ calle: 'Av. López Mateos', numeroExterior: '12', colonia: 'Centro', codigoPostal: '52900', referencias: 'frente al mercado' });
      expect(d.body.actividad).toBe('Limpieza de parabrisas o actividades en cruceros');
    });

    it('el formato anterior (APK instaladas) sigue funcionando y queda como un solo grupo', async () => {
      const r = await enviar(reporteValido()).expect(201);
      const id = await idDe(r.body.folio);
      const d = await http().get(`/api/v1/reportes/${id}`).set('Authorization', 'Bearer token-personal').expect(200);
      expect(d.body.grupos).toEqual([{ rango: '6-11', cantidad: 2 }]);
      expect(d.body.direccion).toBeNull();
    });

    it('"Otro" exige describir la actividad en el formato nuevo y la guarda', async () => {
      const sin = await enviar({ ...reporteNuevo(), actividad: 'Otro' }).expect(400);
      expect(sin.body.mensaje).toBe('Describe la actividad que observaste');
      const con = await enviar({ ...reporteNuevo(), actividad: 'Otro', actividadOtro: 'Malabares' }).expect(201);
      const d = await http().get(`/api/v1/reportes/${await idDe(con.body.folio)}`).set('Authorization', 'Bearer token-personal').expect(200);
      expect(d.body.actividadOtro).toBe('Malabares');
    });

    it('rechaza más de 50 menores, rangos repetidos y rangos fuera de catálogo', async () => {
      const mucho = await enviar({ ...reporteNuevo(), grupos: [{ rango: '0-5', cantidad: 30 }, { rango: '6-11', cantidad: 21 }] }).expect(400);
      expect(mucho.body.codigo).toBe('GRUPOS_INVALIDOS');
      const repetido = await enviar({ ...reporteNuevo(), grupos: [{ rango: '0-5', cantidad: 1 }, { rango: '0-5', cantidad: 1 }] }).expect(400);
      expect(repetido.body.codigo).toBe('GRUPOS_INVALIDOS');
      const inventado = await enviar({ ...reporteNuevo(), grupos: [{ rango: '18-25', cantidad: 1 }] }).expect(400);
      expect(inventado.body.codigo).toBe('VALOR_NO_VALIDO');
      await enviar({ ...reporteNuevo(), grupos: [] }).expect(400);
    });

    it('acepta "Sin determinar" como grupo de edad', async () => {
      await enviar({ ...reporteNuevo(), grupos: [{ rango: 'Sin determinar', cantidad: 4 }] }).expect(201);
    });

    it('rechaza un punto que no cae en el municipio elegido y dice dónde cae', async () => {
      const toluca = await enviar({ ...reporteNuevo(), latitud: 19.2826, longitud: -99.6557 }).expect(400);
      expect(toluca.body.codigo).toBe('UBICACION_FUERA_DEL_MUNICIPIO');
      expect(toluca.body.mensaje).toContain('Toluca');
      expect(toluca.body.mensaje).toContain('Atizapán de Zaragoza');
      const cdmx = await enviar({ ...reporteNuevo(), latitud: 19.4326, longitud: -99.1332 }).expect(400);
      expect(cdmx.body.mensaje).toContain('fuera del Estado de México');
    });

    it('guarda las coordenadas redondeadas a 5 decimales', async () => {
      const r = await enviar({ ...reporteNuevo(), latitud: 19.5594123, longitud: -99.2512987 }).expect(201);
      const [u] = await adminDs.query(
        'SELECT u.latitud, u.longitud FROM ubicacion u JOIN reporte r ON r.id_ubicacion = u.id_ubicacion WHERE r.id_reporte = $1',
        [await idDe(r.body.folio)]);
      expect([Number(u.latitud), Number(u.longitud)]).toEqual([19.55941, -99.2513]);
    });

    it('código postal: rechaza los de otro estado y, con catálogo cargado, los de otro municipio', async () => {
      const cdmx = await enviar({ ...reporteNuevo(), direccion: { ...reporteNuevo().direccion, codigoPostal: '06000' } }).expect(400);
      expect(cdmx.body.codigo).toBe('CODIGO_POSTAL_NO_VALIDO');
      await enviar({ ...reporteNuevo(), direccion: { ...reporteNuevo().direccion, codigoPostal: '5290' } }).expect(400);

      // Con el catálogo opcional cargado (solo en esta prueba), 52900 apunta a Toluca y no a Atizapán.
      await adminDs.query("INSERT INTO codigo_postal_municipio (codigo_postal, clave_inegi) VALUES ('52900', '15106')");
      try {
        const otro = await enviar(reporteNuevo()).expect(400);
        expect(otro.body.mensaje).toBe('El código postal 52900 no corresponde a Atizapán de Zaragoza');
      } finally {
        await adminDs.query("DELETE FROM codigo_postal_municipio WHERE codigo_postal = '52900'");
      }
    });

    it('catálogo de actividades: el del socio, ordenado, con "Otro" y "No sé" al final (Fase 6)', async () => {
      const r = await http().get('/api/v1/catalogos/actividades').expect(200);
      expect(r.body).toHaveLength(14);
      expect(r.body.slice(-2)).toEqual([{ nombre: 'Otro', requiereDetalle: true }, { nombre: 'No sé', requiereDetalle: false }]);
      for (const a of ['Mendicidad', 'Carga y descarga', 'Trabajo en comercio', 'Recolección de residuos']) {
        expect(r.body.map((x: { nombre: string }) => x.nombre)).toContain(a);
      }
      expect(r.body.map((x: { nombre: string }) => x.nombre)).not.toContain('Mendicidad forzada');
      expect(r.body.filter((a: { requiereDetalle: boolean }) => a.requiereDetalle)).toHaveLength(1);
      const c = await http().get('/api/v1/catalogos').expect(200);
      expect(c.body.actividades).toEqual(r.body.map((a: { nombre: string }) => a.nombre));
      expect(c.body.rangosEdad).toContain('Sin determinar');
    });

    it('geocodificación inversa mediada: dirección + municipio, con caché', async () => {
      const antes = fuenteGeoFalsa.llamadasReversa;
      const r = await http().get('/api/v1/geo/reversa?lat=19.55941&lng=-99.25129').set('X-Forwarded-For', nuevaIp()).expect(200);
      expect(r.body.direccion).toEqual({ calle: 'Avenida Adolfo López Mateos', numeroExterior: '12', colonia: 'Centro', codigoPostal: '52900' });
      expect(r.body.municipioSugerido).toEqual({ id: 1, nombre: 'Atizapán de Zaragoza' });
      expect(r.body.atribucion).toContain('OpenStreetMap');
      // Mismas coordenadas redondeadas a 4 decimales → sale de la caché.
      await http().get('/api/v1/geo/reversa?lat=19.55942&lng=-99.25131').set('X-Forwarded-For', nuevaIp()).expect(200);
      expect(fuenteGeoFalsa.llamadasReversa).toBe(antes + 1);
    });

    it('geocodificación: fuera del Estado de México y coordenadas inválidas se rechazan', async () => {
      const lejos = await http().get('/api/v1/geo/reversa?lat=25.6866&lng=-100.3161').set('X-Forwarded-For', nuevaIp()).expect(400);
      expect(lejos.body.codigo).toBe('FUERA_DE_COBERTURA');
      await http().get('/api/v1/geo/reversa?lat=abc&lng=-99.25').set('X-Forwarded-For', nuevaIp()).expect(400);
      await http().get('/api/v1/geo/reversa?lat=19.5').set('X-Forwarded-For', nuevaIp()).expect(400);
    });

    it('teselas: solo del Estado de México y con zoom permitido', async () => {
      const ok = await http().get('/api/v1/geo/teselas/16/14699/29136.png').set('X-Forwarded-For', nuevaIp()).expect(200);
      expect(ok.headers['content-type']).toContain('image/png');
      expect(ok.headers['cache-control']).toContain('max-age=86400');
      await http().get('/api/v1/geo/teselas/16/0/0.png').set('X-Forwarded-For', nuevaIp()).expect(404);
      await http().get('/api/v1/geo/teselas/19/117592/233088.png').set('X-Forwarded-For', nuevaIp()).expect(404);
      await http().get('/api/v1/geo/teselas/16/x/29136.png').set('X-Forwarded-For', nuevaIp()).expect(400);
    });
  });

  describe('alineación con el socio formador (Fase 6)', () => {
    const personal = { Authorization: 'Bearer token-personal' };
    const nuevo = (extra: object = {}) => ({
      municipioId: 1,
      direccion: { calle: 'Calle Ficticia', numeroExterior: '10', colonia: 'Centro', codigoPostal: '52900' },
      grupos: [{ rango: '12-14', cantidad: 1 }],
      actividad: 'Carga y descarga', situacionRiesgo: 'No', descripcion: 'Reporte de prueba de la Fase 6.',
      avisoPrivacidadVersion: '2026-10-v3', ...extra,
    });
    const enviar = (cuerpo: object) => http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp()).send(cuerpo);

    it('catálogos: estatus con etiqueta pública, rangos nuevos sin 12-17, peligro y cantidades', async () => {
      const r = await http().get('/api/v1/catalogos').expect(200);
      expect(r.body.estatusDetalle.map((e: { etiqueta: string }) => e.etiqueta))
        .toEqual(['Registrado', 'En revisión', 'En seguimiento', 'Canalizado', 'Concluido', 'Cancelado', 'Archivado', 'Reincidente']);
      expect(r.body.rangosEdad).toEqual(['0-5', '6-11', '12-14', '15-17', 'Sin determinar']);
      expect(r.body.peligro).toEqual(['Sí', 'No', 'No sé']);
      expect(r.body.cantidades).toEqual(['1', '2', '3', '4', '5+', 'No sé']);
    });

    it('con canal el folio lleva la clave municipal y se puede consultar; sin canal sigue el formato heredado', async () => {
      const a = await enviar(nuevo({ canal: 'app' })).expect(201);
      expect(a.body.folio).toMatch(/^RIETI-ATZ-\d{4}-\d{6}$/);
      const c = await http().post('/api/v1/reportes/consulta').set('X-Forwarded-For', nuevaIp())
        .send({ folio: a.body.folio.toLowerCase(), clave: a.body.claveConsulta }).expect(200);
      expect(c.body).toMatchObject({ estatus: 'Recibido', estatusEtiqueta: 'Registrado' });
      expect(c.body.historial[0]).toMatchObject({ estatus: 'Recibido', etiqueta: 'Registrado' });
      const b = await enviar(nuevo()).expect(201);
      expect(b.body.folio).toMatch(/^RIETI-\d{4}-\d{6}$/);
      // El consecutivo es global por año: no revela el volumen de cada municipio.
      expect(Number(b.body.folio.slice(-6))).toBe(Number(a.body.folio.slice(-6)) + 1);
      await enviar(nuevo({ canal: 'institucional' })).expect(400); // el canal institucional no lo declara un cliente público
    });

    it('peligro inmediato → prioridad Alta calculada por el servidor (no se acepta del cliente) y primero en la bandeja', async () => {
      await enviar(nuevo({ prioridad: 'Alta' })).expect(400);
      const a = await enviar(nuevo({ peligroInmediato: 'Sí', canal: 'web' })).expect(201);
      const m = await enviar(nuevo({ peligroInmediato: 'No', situacionRiesgo: 'Sí' })).expect(201);
      const b = await http().get('/api/v1/reportes?orden=prioridad&tamano=100').set(personal).expect(200);
      expect(b.body.elementos[0]).toMatchObject({ prioridad: 'Alta', peligroInmediato: 'Sí' });
      const prios = b.body.elementos.map((e: { prioridad: string }) => ['Alta', 'Media', 'Normal'].indexOf(e.prioridad));
      expect(prios).toEqual([...prios].sort((x: number, y: number) => x - y));
      const alta = await http().get('/api/v1/reportes?prioridad=Alta&tamano=100').set(personal).expect(200);
      expect(alta.body.elementos.map((e: { folio: string }) => e.folio)).toContain(a.body.folio);
      expect(alta.body.elementos.map((e: { folio: string }) => e.folio)).not.toContain(m.body.folio);
      const resumen = await http().get('/api/v1/estadisticas/resumen').set(personal).expect(200);
      expect(resumen.body.prioridadAltaPendientes).toBeGreaterThanOrEqual(1);
      const det = await http().get(`/api/v1/reportes/${alta.body.elementos[0].id}`).set(personal).expect(200);
      expect(det.body).toMatchObject({ prioridad: 'Alta', canal: 'web', origen: 'ciudadano', estatusEtiqueta: 'Registrado' });
      expect(det.body.historial[0].etiqueta).toBe('Registrado');
    });

    it('cantidad y edades nuevas: 12-14, 15-17 y "No sé" (= sin determinar); la cantidad debe cuadrar', async () => {
      await enviar(nuevo({ grupos: [{ rango: '15-17', cantidad: 2 }, { rango: 'No sé', cantidad: 3 }], cantidad: '5+' })).expect(201);
      await enviar(nuevo({ grupos: [{ rango: 'No sé', cantidad: 1 }], cantidad: 'No sé' })).expect(201);
      const mal = await enviar(nuevo({ grupos: [{ rango: '6-11', cantidad: 2 }], cantidad: '3' })).expect(400);
      expect(mal.body.codigo).toBe('CANTIDAD_INCOHERENTE');
      await enviar(nuevo({ cantidad: '7' })).expect(400);
      const [fila] = await adminDs.query(`SELECT cantidad_categoria FROM reporte ORDER BY id_reporte DESC LIMIT 1 OFFSET 0`);
      expect(fila.cantidad_categoria).toBe('No sé');
    });

    it('compatibilidad: el formato anterior, 12-17 y las actividades heredadas siguen aceptándose', async () => {
      const r = await enviar({ ...reporteValido(), edadAproximada: '12-17', actividad: 'Mendicidad forzada' }).expect(201);
      expect(r.body.folio).toMatch(/^RIETI-\d{4}-\d{6}$/);
    });

    it('Reincidente exige comentario y vuelve a revisión; Archivado es terminal', async () => {
      const a = await enviar(nuevo({ canal: 'app' })).expect(201);
      const [{ id }] = await adminDs.query('SELECT f.id_reporte AS id FROM folio f WHERE f.codigo = $1', [a.body.folio]);
      const cambiar = (estatus: string, extra: object = {}) => http().patch(`/api/v1/reportes/${id}/estatus`).set(personal).send({ estatus, ...extra });
      await cambiar('En revisión').expect(200);
      await cambiar('En atención').expect(200);
      const concl = await cambiar('Concluido').expect(200);
      expect(concl.body.transicionesPermitidas).toEqual(['Archivado', 'Reincidente']);
      expect((await cambiar('Reincidente').expect(422)).body.codigo).toBe('COMENTARIO_REQUERIDO');
      const re = await cambiar('Reincidente', { comentario: 'Se volvió a observar en el mismo crucero' }).expect(200);
      expect(re.body).toMatchObject({ estatus: 'Reincidente', estatusEtiqueta: 'Reincidente', transicionesPermitidas: ['En revisión', 'En atención'] });
      const pend = await http().get('/api/v1/reportes?pendientes=true&tamano=100').set(personal).expect(200);
      expect(pend.body.elementos.map((e: { id: number }) => e.id)).toContain(Number(id)); // Reincidente cuenta como pendiente
      await cambiar('En atención').expect(200);
      await cambiar('Concluido').expect(200);
      const arch = await cambiar('Archivado').expect(200);
      expect(arch.body.transicionesPermitidas).toEqual([]);
    });
  });

  describe('panel del personal (Fase 3)', () => {
    const personal = { Authorization: 'Bearer token-personal' };
    const RUTAS = ['distribuciones', 'tiempos', 'sin-atender', 'mapa-calor'];

    it('las estadísticas nuevas exigen sesión y rol', async () => {
      for (const r of RUTAS) {
        await http().get(`/api/v1/estadisticas/${r}`).expect(401);
        await http().get(`/api/v1/estadisticas/${r}`).set('Authorization', 'Bearer token-sin-rol').expect(403);
      }
      await http().get('/api/v1/reportes/exportar.csv').expect(401);
      await http().get('/api/v1/reportes/exportar.csv').set('Authorization', 'Bearer token-sin-rol').expect(403);
    });

    it('distribuciones: solo conteos, con umbral (celdas pequeñas en null)', async () => {
      const r = await http().get('/api/v1/estadisticas/distribuciones').set(personal).expect(200);
      expect(r.body.umbral).toBe(3);
      for (const lista of [r.body.porMunicipio, r.body.porActividad, r.body.porGrupoEdad]) {
        for (const c of lista) expect(c.total === null || c.total >= 3).toBe(true);
      }
      const edades = r.body.porGrupoEdad.map((c: { etiqueta: string }) => c.etiqueta);
      expect(edades).toContain('0-5');
      expect(r.body.porMunicipio.find((c: { etiqueta: string }) => c.etiqueta === 'Atizapán de Zaragoza').total).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(r.body)).not.toMatch(/RIETI-|Dos menores|López Mateos/);
    });

    it('tiempos por estatus: los 6 estatus en orden y nada de datos individuales', async () => {
      const r = await http().get('/api/v1/estadisticas/tiempos').set(personal).expect(200);
      expect(r.body.porEstatus.map((t: { estatus: string }) => t.estatus))
        .toEqual(['Recibido', 'En revisión', 'En atención', 'Canalizado', 'Concluido', 'Descartado', 'Archivado', 'Reincidente']);
      for (const t of r.body.porEstatus) expect(t.horasPromedio === null || t.casos >= 3).toBe(true);
      // Hitos (Fase 5): con pocos casos no se publica un promedio engañoso.
      for (const hito of [r.body.hastaPrimeraRevision, r.body.hastaConclusion]) {
        expect(Object.keys(hito).sort()).toEqual(['casos', 'horasMediana', 'horasPromedio', 'minimoCasos']);
        expect(hito).toMatchObject({ casos: expect.any(Number), minimoCasos: 5 });
        if (hito.casos < 5) expect(hito.horasPromedio).toBeNull();
      }
    });

    it('resumen: pendientes con riesgo percibido (Fase 5)', async () => {
      const r = await http().get('/api/v1/estadisticas/resumen').set(personal).expect(200);
      const esperado = (await adminDs.query(`
        SELECT count(*)::int AS n FROM reporte r JOIN reporte_caso rc ON rc.id_reporte = r.id_reporte
        JOIN caso c ON c.id_caso = rc.id_caso JOIN estatus_reporte e ON e.id_estatus = c.id_estatus
        JOIN riesgo ri ON ri.id_riesgo = r.id_riesgo
        WHERE e.nombre IN ('Recibido', 'En revisión') AND ri.nombre = 'Sí'`))[0].n;
      expect(r.body.riesgoAltoPendientes).toBe(esperado);
      expect(r.body.riesgoAltoPendientes).toBeLessThanOrEqual(r.body.pendientes);
    });

    it('casos sin atender: cuenta pendientes viejos y la bandeja los lista con el mismo filtro', async () => {
      expect((await http().get('/api/v1/estadisticas/sin-atender?dias=1').set(personal).expect(200)).body.total).toBe(0);
      // Se envejece un caso Recibido 10 días (solo en la base de prueba).
      const [{ id_caso: idCaso, codigo }] = await adminDs.query(`
        SELECT c.id_caso, f.codigo FROM caso c JOIN estatus_reporte e ON e.id_estatus = c.id_estatus
        JOIN reporte_caso rc ON rc.id_caso = c.id_caso JOIN folio f ON f.id_reporte = rc.id_reporte
        WHERE e.nombre = 'Recibido' ORDER BY c.id_caso LIMIT 1`);
      await adminDs.query("UPDATE caso SET fecha_actualizacion = now() - interval '10 days' WHERE id_caso = $1", [idCaso]);
      const r = await http().get('/api/v1/estadisticas/sin-atender?dias=7').set(personal).expect(200);
      expect(r.body).toMatchObject({ dias: 7, total: 1, umbral: 3 });
      expect(r.body.porMunicipio[0].total).toBeNull(); // 1 < umbral
      const b = await http().get('/api/v1/reportes?sinAtenderDias=7').set(personal).expect(200);
      expect(b.body.elementos.map((e: { folio: string }) => e.folio)).toEqual([codigo]);
      await http().get('/api/v1/estadisticas/sin-atender?dias=0').set(personal).expect(400);
    });

    it('mapa de calor: centros de celda (nunca la coordenada de un reporte) y umbral', async () => {
      const r = await http().get('/api/v1/estadisticas/mapa-calor').set(personal).expect(200);
      expect(r.body.tamanoCelda).toBe(0.005);
      expect(r.body.celdas.length).toBeGreaterThanOrEqual(1);
      for (const c of r.body.celdas) {
        expect(c.total).toBeGreaterThanOrEqual(3);
        expect([c.lat, c.lng]).not.toEqual([19.5594, -99.2512]);
      }
      expect(JSON.stringify(r.body)).not.toMatch(/RIETI-/);
    });

    it('bandeja: búsqueda por folio, filtro por actividad y fecha, y orden', async () => {
      const recientes = (await http().get('/api/v1/reportes?tamano=100').set(personal).expect(200)).body.elementos;
      const antiguos = (await http().get('/api/v1/reportes?tamano=100&orden=antiguos').set(personal).expect(200)).body.elementos;
      expect(antiguos.map((e: { id: number }) => e.id)).toEqual([...recientes].reverse().map((e: { id: number }) => e.id));

      const folio: string = recientes[0].folio;
      const porFolio = await http().get(`/api/v1/reportes?folio=${folio.slice(-6).toLowerCase()}`).set(personal).expect(200);
      expect(porFolio.body.elementos.map((e: { folio: string }) => e.folio)).toContain(folio);
      await http().get('/api/v1/reportes?folio=%25%27%3B').set(personal).expect(400); // %'; no pasa la validación

      const cruceros = await http().get(`/api/v1/reportes?actividad=${encodeURIComponent('Limpieza de parabrisas o actividades en cruceros')}`).set(personal).expect(200);
      expect(cruceros.body.total).toBeGreaterThanOrEqual(1);
      expect(cruceros.body.elementos.every((e: { actividad: string }) => e.actividad.startsWith('Limpieza'))).toBe(true);
      expect((await http().get('/api/v1/reportes?desde=2099-01-01').set(personal).expect(200)).body.total).toBe(0);
    });

    it('CSV: columnas de la bandeja, sin descripción ni coordenadas, y sin inyección de fórmulas', async () => {
      // Reporte con una colonia que intenta inyectar una fórmula.
      const { ubicacion, cantidadNinos, edadAproximada, ...resto } = reporteValido();
      expect(ubicacion && cantidadNinos && edadAproximada).toBeTruthy();
      await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp()).send({
        ...resto, grupos: [{ rango: '6-11', cantidad: 1 }],
        direccion: { calle: 'Calle 5', colonia: '=HYPERLINK("http://evil")', codigoPostal: '52900' },
      }).expect(201);

      const r = await http().get('/api/v1/reportes/exportar.csv').set(personal).expect(200);
      expect(r.headers['content-type']).toContain('text/csv');
      expect(r.headers['content-disposition']).toContain('attachment');
      expect(r.text.charCodeAt(0)).toBe(0xfeff);
      const lineas = r.text.slice(1).trim().split('\r\n');
      expect(lineas[0]).toBe('Folio,Fecha,Estatus,Municipio,Colonia,Actividad,Menores,Grupos de edad,Riesgo percibido,Última actualización');
      expect(r.text).not.toMatch(/Dos menores vendiendo|19\.5594|-99\.2512/);
      expect(r.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
      expect(r.text).not.toMatch(/(^|,)=HYPERLINK/m);

      const filtrado = await http().get('/api/v1/reportes/exportar.csv?desde=2099-01-01').set(personal).expect(200);
      expect(filtrado.text.slice(1).trim().split('\r\n')).toHaveLength(1); // solo encabezado
    });

    it('el administrador también exporta (reportes.exportar)', async () => {
      await http().get('/api/v1/reportes/exportar.csv').set('Authorization', 'Bearer token-admin').expect(200);
    });
  });

  describe('cuentas de ciudadano (Fase 4)', () => {
    const ciudadano1 = { Authorization: 'Bearer token-ciudadano-1' };
    const ciudadano2 = { Authorization: 'Bearer token-ciudadano-2' };
    let folioVinculado = '';

    it('A32: el registro responde igual exista o no el correo', async () => {
      const nuevo = await http().post('/api/v1/ciudadanos/registro').set('X-Forwarded-For', nuevaIp())
        .send({ correo: 'nueva@ejemplo.mx', password: 'ContrasenaSegura1' }).expect(202);
      const existente = await http().post('/api/v1/ciudadanos/registro').set('X-Forwarded-For', nuevaIp())
        .send({ correo: 'existe@ejemplo.mx', password: 'ContrasenaSegura1' }).expect(202);
      expect(existente.body).toEqual(nuevo.body);
      await http().post('/api/v1/ciudadanos/registro').set('X-Forwarded-For', nuevaIp())
        .send({ correo: 'corta@ejemplo.mx', password: 'corta' }).expect(400);
    });

    it('login entrega tokens; confirmar valida el formato del código', async () => {
      const r = await http().post('/api/v1/ciudadanos/login').set('X-Forwarded-For', nuevaIp())
        .send({ correo: 'persona@ejemplo.mx', password: 'ContrasenaSegura1' }).expect(200);
      expect(r.body).toMatchObject({ accessToken: 'token-ciudadano-1', expiresIn: 3600 });
      await http().post('/api/v1/ciudadanos/confirmar').set('X-Forwarded-For', nuevaIp())
        .send({ correo: 'persona@ejemplo.mx', codigo: '12ab' }).expect(400);
    });

    it('separación estricta: token de ciudadano no abre rutas del personal y viceversa', async () => {
      await http().get('/api/v1/reportes').set(ciudadano1).expect(401);
      await http().get('/api/v1/estadisticas/resumen').set(ciudadano1).expect(401);
      await http().get('/api/v1/ciudadano/cuenta').set('Authorization', 'Bearer token-personal').expect(401);
      await http().get('/api/v1/ciudadano/reportes').set('Authorization', 'Bearer token-admin').expect(401);
      await http().get('/api/v1/ciudadano/reportes').expect(401);
    });

    it('un reporte con token pero sin vincularCuenta sigue siendo anónimo; con vincularCuenta queda ligado', async () => {
      await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp()).set(ciudadano1).send(reporteValido()).expect(201);
      expect((await http().get('/api/v1/ciudadano/reportes').set(ciudadano1).expect(200)).body).toEqual([]);

      const r = await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp()).set(ciudadano1)
        .send({ ...reporteValido(), vincularCuenta: true }).expect(201);
      folioVinculado = r.body.folio;
      const mios = (await http().get('/api/v1/ciudadano/reportes').set(ciudadano1).expect(200)).body;
      expect(mios.map((x: { folio: string }) => x.folio)).toEqual([folioVinculado]);
      expect(mios[0]).toMatchObject({ estatus: 'Recibido', municipio: 'Atizapán de Zaragoza' });
      expect(mios[0].historial[0].estatus).toBe('Recibido');
      expect(JSON.stringify(mios)).not.toMatch(/Dos menores|López Mateos/);
    });

    it('vincularCuenta sin sesión → 400; con un token que no es de ciudadano → 401', async () => {
      const sin = await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp()).send({ ...reporteValido(), vincularCuenta: true }).expect(400);
      expect(sin.body.codigo).toBe('SESION_REQUERIDA');
      await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp()).set('Authorization', 'Bearer inventado')
        .send({ ...reporteValido(), vincularCuenta: true }).expect(401);
    });

    it('compatibilidad: las APK que mandan el token del personal pueden seguir enviando reportes anónimos', async () => {
      const r = await http().post('/api/v1/reportes').set('X-Forwarded-For', nuevaIp()).set('Authorization', 'Bearer token-personal')
        .send(reporteValido()).expect(201);
      const [fila] = await adminDs.query(
        'SELECT r.cuenta_ciudadano_id FROM reporte r JOIN folio f ON f.id_reporte = r.id_reporte WHERE f.codigo = $1', [r.body.folio]);
      expect(fila).toEqual({ cuenta_ciudadano_id: null });
    });

    it('otra cuenta no ve los reportes ajenos y el personal no ve la cuenta vinculada', async () => {
      expect((await http().get('/api/v1/ciudadano/reportes').set(ciudadano2).expect(200)).body).toEqual([]);
      const [{ id_reporte: id }] = await adminDs.query('SELECT id_reporte FROM folio WHERE codigo = $1', [folioVinculado]);
      const d = await http().get(`/api/v1/reportes/${id}`).set('Authorization', 'Bearer token-personal').expect(200);
      expect(JSON.stringify(d.body)).not.toMatch(/cuenta|persona@ejemplo/i);
    });

    it('perfil: correo desde Cognito (RIETI no lo guarda) y conteo de reportes', async () => {
      const r = await http().get('/api/v1/ciudadano/cuenta').set(ciudadano1).expect(200);
      expect(r.body).toMatchObject({ correo: 'persona@ejemplo.mx', reportesVinculados: 1 });
      const columnas = (await adminDs.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'cuentas_ciudadano'")).map((c: { column_name: string }) => c.column_name);
      expect(columnas.sort()).toEqual(['cognito_sub', 'fecha_creacion', 'id_cuenta', 'ultimo_acceso']);
    });

    it('eliminar la cuenta conserva el reporte, ya sin vínculo', async () => {
      await http().delete('/api/v1/ciudadano/cuenta').set(ciudadano1).expect(200);
      expect(cuentasFalsas.eliminados).toBe(1);
      const [fila] = await adminDs.query(
        'SELECT r.cuenta_ciudadano_id FROM reporte r JOIN folio f ON f.id_reporte = r.id_reporte WHERE f.codigo = $1', [folioVinculado]);
      expect(fila).toEqual({ cuenta_ciudadano_id: null });
      expect(await adminDs.query("SELECT 1 FROM cuentas_ciudadano WHERE cognito_sub = '55555555-5555-4555-8555-555555555555'")).toEqual([]);
    });
  });

  describe('estadísticas (solo agregados)', () => {
    const personal = { Authorization: 'Bearer token-personal' };

    it('sin token → 401; sin rol → 403', async () => {
      await http().get('/api/v1/estadisticas/resumen').expect(401);
      await http().get('/api/v1/estadisticas/resumen').set('Authorization', 'Bearer token-sin-rol').expect(403);
    });

    it('devuelve solo conteos, con los 6 estatus en orden', async () => {
      const r = await http().get('/api/v1/estadisticas/resumen').set(personal).expect(200);
      expect(Object.keys(r.body).sort()).toEqual(['nuevosUltimos7Dias', 'pendientes', 'porEstatus', 'porMes', 'prioridadAltaPendientes', 'riesgoAltoPendientes', 'sinMunicipio', 'total']);
      expect(r.body.porEstatus.map((e: { etiqueta: string }) => e.etiqueta))
        .toEqual(['Recibido', 'En revisión', 'En atención', 'Canalizado', 'Concluido', 'Descartado', 'Archivado', 'Reincidente']);
      const suma = (l: { total: number }[]) => l.reduce((a, e) => a + e.total, 0);
      expect(suma(r.body.porEstatus)).toBe(r.body.total);
      expect(suma(r.body.porMes)).toBe(r.body.total);
      expect(r.body.nuevosUltimos7Dias).toBe(r.body.total);
      expect(JSON.stringify(r.body)).not.toMatch(/RIETI-|Dos menores|López Mateos/);
    });

    it('filtra por municipio y por fecha, y valida el formato', async () => {
      const todos = (await http().get('/api/v1/estadisticas/resumen').set(personal)).body;
      const atizapan = await http().get('/api/v1/estadisticas/resumen?municipioId=1').set(personal).expect(200);
      expect(atizapan.body.total).toBe(todos.total - todos.sinMunicipio);
      const futuro = await http().get('/api/v1/estadisticas/resumen?desde=2099-01-01').set(personal).expect(200);
      expect(futuro.body.total).toBe(0);
      expect(futuro.body.porEstatus.every((e: { total: number }) => e.total === 0)).toBe(true);
      await http().get('/api/v1/estadisticas/resumen?desde=ayer').set(personal).expect(400);
    });
  });

  describe('red de municipios (D-17)', () => {
    it('es pública y trae solo datos de ejemplo con example.org', async () => {
      const r = await http().get('/api/v1/red-municipios').expect(200);
      expect(r.body.hayDatosDeEjemplo).toBe(true);
      const contactos = r.body.municipios.flatMap((m: { contactos: object[] }) => m.contactos);
      expect(contactos.length).toBeGreaterThan(0);
      expect(contactos.every((c: { valor: string; esEjemplo: boolean }) => c.esEjemplo && /example\.org/.test(c.valor))).toBe(true);
    });

    it('el enlace municipal no puede editarla (403)', async () => {
      await http().put('/api/v1/red-municipios/1').set('Authorization', 'Bearer token-personal').send({ contactos: [] }).expect(403);
    });

    it('el administrador la reemplaza; un enlace sin https se rechaza', async () => {
      const malo = await http().put('/api/v1/red-municipios/1').set('Authorization', 'Bearer token-admin')
        .send({ contactos: [{ tipo: 'enlace', valor: 'http://example.org' }] }).expect(400);
      expect(malo.body.codigo).toBe('CONTACTO_INVALIDO');
      const r = await http().put('/api/v1/red-municipios/1').set('Authorization', 'Bearer token-admin')
        .send({ contactos: [{ tipo: 'correo', valor: 'red@example.org', etiqueta: 'Prueba' }] }).expect(200);
      expect(r.body.hayDatosDeEjemplo).toBe(false);
      expect(r.body.municipios[0].contactos).toEqual([{ tipo: 'correo', valor: 'red@example.org', etiqueta: 'Prueba', esEjemplo: false }]);
    });
  });

  describe('perfil del personal (D-18)', () => {
    it('el enlace municipal ve su perfil y permisos, sin red.editar', async () => {
      const r = await http().get('/api/v1/auth/perfil').set('Authorization', 'Bearer token-personal').expect(200);
      expect(r.body.correo).toBe('enlace@ejemplo.mx');
      expect(r.body.perfil).toBe('Enlace municipal');
      expect(r.body.permisos.map((p: { permiso: string }) => p.permiso)).not.toContain('red.editar');
    });

    it('el administrador tiene red.editar', async () => {
      const r = await http().get('/api/v1/auth/perfil').set('Authorization', 'Bearer token-admin').expect(200);
      expect(r.body.perfil).toBe('Administrador');
      expect(r.body.permisos.map((p: { permiso: string }) => p.permiso)).toContain('red.editar');
    });

    it('sin token → 401', async () => {
      await http().get('/api/v1/auth/perfil').expect(401);
    });
  });

  describe('errores y cabeceras', () => {
    it('las rutas inexistentes del API responden en español', async () => {
      const r = await http().get('/api/v1/no-existe').expect(404);
      expect(r.body).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'No se encontró el recurso' });
    });

    it('envía una CSP estricta sin orígenes externos ni unsafe-inline', async () => {
      const r = await http().get('/health').expect(200);
      const csp: string = r.headers['content-security-policy'];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("style-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https:|\*/);
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
