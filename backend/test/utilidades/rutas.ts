import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { CIUDADANO_KEY, Permiso, PERMISO_KEY, PUBLICO_KEY, ROLES_KEY } from '../../src/auth/roles';
import { AuthController } from '../../src/auth/auth.controller';
import { ReportesController } from '../../src/reportes/reportes.controller';
import { FotosController } from '../../src/fotos/fotos';
import { HealthController } from '../../src/health/health.controller';
import { AvisosController } from '../../src/avisos/aviso-privacidad';
import { CatalogosController } from '../../src/catalogos/catalogos.controller';
import { RedController } from '../../src/red/red.controller';
import { EstadisticasController } from '../../src/estadisticas/estadisticas.controller';
import { GeoController } from '../../src/geo/geo.controller';
import { CuentaCiudadanoController, CuentasPublicasController } from '../../src/ciudadanos/ciudadanos.controller';
import { ExpedienteController } from '../../src/expediente/expediente.controller';
import { AdminController } from '../../src/admin/admin.controller';

/** Todos los controladores del API. Un controlador nuevo se agrega aquí. */
export const CONTROLADORES = [
  AuthController, ReportesController, FotosController, HealthController, AvisosController, CatalogosController, RedController, EstadisticasController,
  GeoController, CuentasPublicasController, CuentaCiudadanoController, ExpedienteController, AdminController,
];

/** Ruta declarada en un controlador, con sus metadatos de acceso. */
export interface RutaDeclarada {
  /** `VERBO ruta`, p. ej. `GET reportes/:id` (sin prefijo global). */
  id: string;
  verbo: string;
  ruta: string;
  publica: boolean;
  roles: string[] | undefined;
  permiso: Permiso | undefined;
  /** 'requerido' u 'opcional' si la ruta usa tokens del pool de ciudadanos. */
  ciudadano: 'requerido' | 'opcional' | undefined;
}

/** Recorre los métodos de un controlador y devuelve su ruta, verbo y metadatos de acceso. */
export function rutasDe(ctrl: new (...a: never[]) => unknown): RutaDeclarada[] {
  const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? '');
  const publicoClase = Reflect.getMetadata(PUBLICO_KEY, ctrl) === true;
  return Object.getOwnPropertyNames(ctrl.prototype)
    .filter((m) => m !== 'constructor')
    .map((m): RutaDeclarada | null => {
      const fn = ctrl.prototype[m as keyof typeof ctrl.prototype] as object;
      const path = Reflect.getMetadata(PATH_METADATA, fn);
      if (path === undefined) return null;
      const verbo = RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn) as number];
      const ruta = [base, path].filter((p) => p && p !== '/').join('/');
      return {
        id: `${verbo} ${ruta}`,
        verbo,
        ruta,
        publica: publicoClase || Reflect.getMetadata(PUBLICO_KEY, fn) === true,
        roles: Reflect.getMetadata(ROLES_KEY, fn) as string[] | undefined,
        permiso: Reflect.getMetadata(PERMISO_KEY, fn) as Permiso | undefined,
        ciudadano: Reflect.getMetadata(CIUDADANO_KEY, fn) as 'requerido' | 'opcional' | undefined,
      };
    })
    .filter((r): r is RutaDeclarada => r !== null);
}

/** Todas las rutas del API. */
export function todasLasRutas(): RutaDeclarada[] {
  return CONTROLADORES.flatMap(rutasDe);
}
