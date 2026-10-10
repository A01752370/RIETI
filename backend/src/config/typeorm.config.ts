import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { obtenerPasswordBd } from './db-password';
import {
  Actividad, ContactoMunicipio, EstatusReporte, Municipio, RangoEdad, Riesgo, RolUsuario,
} from '../catalogos/catalogo.entities';
import { Usuario } from '../auth/usuario.entity';
import {
  Caso, Folio, Reporte, ReporteCaso, Seguimiento, Ubicacion,
} from '../reportes/reporte.entities';

export const ENTIDADES = [
  Municipio, ContactoMunicipio, RolUsuario, Actividad, Riesgo, RangoEdad, EstatusReporte,
  Usuario, Ubicacion, Reporte, Folio, Caso, ReporteCaso, Seguimiento,
];

/**
 * TLS hacia RDS verificando el certificado con el bundle de CAs de AWS
 * (descargado en la imagen Docker). `DB_SSL=false` solo para desarrollo local.
 */
function opcionesSsl() {
  if (process.env.DB_SSL === 'false') return false;
  const ca = readFileSync(process.env.DB_SSL_CA ?? '/etc/ssl/rds/global-bundle.pem', 'utf8');
  return { ca, rejectUnauthorized: true };
}

export function opcionesTypeOrm(): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME,
    database: process.env.DB_NAME,
    ssl: opcionesSsl(),
    entities: ENTIDADES,
    // .js en la imagen (dist/); .ts cuando las pruebas corren con ts-jest.
    migrations: [join(__dirname, '..', 'database', 'migrations', __filename.endsWith('.ts') ? '*.ts' : '*.js')],
    // Con un usuario sin DDL (rieti_app, D-08) las migraciones se corren aparte con el
    // usuario maestro y aquí se desactivan con DB_MIGRAR_AL_INICIAR=false.
    migrationsRun: process.env.DB_MIGRAR_AL_INICIAR !== 'false',
    // Nunca true: el esquema solo cambia por migraciones.
    synchronize: false,
    logging: ['error', 'migration'],
    // `extra` se pasa tal cual a node-postgres, que acepta la contraseña como función async.
    extra: { password: obtenerPasswordBd, max: 10, connectionTimeoutMillis: 5000 },
  };
}
