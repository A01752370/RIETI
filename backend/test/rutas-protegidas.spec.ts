import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { MATRIZ_PERMISOS, Permiso, PERMISO_KEY, PUBLICO_KEY, ROLES_KEY, permisosDe } from '../src/auth/roles';
import { AuthController } from '../src/auth/auth.controller';
import { ReportesController } from '../src/reportes/reportes.controller';
import { HealthController } from '../src/health/health.controller';
import { AvisosController } from '../src/avisos/aviso-privacidad';
import { CatalogosController } from '../src/catalogos/catalogos.controller';
import { RedController } from '../src/red/red.controller';
import { EstadisticasController } from '../src/estadisticas/estadisticas.controller';

/**
 * Inventario de rutas públicas (CLAUDE.md, regla 6). Si alguien agrega una ruta
 * pública nueva, esta prueba falla hasta que se agregue aquí a propósito.
 */
const PUBLICAS_PERMITIDAS = new Set([
  'GET health', 'GET health/ready',
  'POST auth/login',
  'POST reportes', 'POST reportes/consulta',
  'GET avisos-privacidad/vigente',
  'GET catalogos', 'GET catalogos/municipios',
  'GET red-municipios',
]);

/**
 * Matriz esperada ruta → permiso (docs/seguridad/roles-y-permisos.md). Si una
 * ruta del personal cambia de permiso o aparece una nueva, esta prueba falla.
 */
const PERMISO_ESPERADO: Record<string, Permiso> = {
  'GET reportes': 'reportes.ver',
  'GET reportes/:id': 'reportes.ver',
  'PATCH reportes/:id/estatus': 'reportes.gestionar',
  'POST reportes/:id/seguimientos': 'reportes.gestionar',
  'GET estadisticas/resumen': 'estadisticas.ver',
  'PUT red-municipios/:municipioId': 'red.editar',
  'GET auth/perfil': 'perfil.ver',
};

const CONTROLADORES = [
  AuthController, ReportesController, HealthController, AvisosController, CatalogosController, RedController, EstadisticasController,
];

/** Recorre los métodos de un controlador y devuelve su ruta, verbo y metadatos de acceso. */
function rutas(ctrl: new (...a: never[]) => unknown) {
  const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? '');
  const publicoClase = Reflect.getMetadata(PUBLICO_KEY, ctrl) === true;
  return Object.getOwnPropertyNames(ctrl.prototype)
    .filter((m) => m !== 'constructor')
    .map((m) => {
      const fn = ctrl.prototype[m as keyof typeof ctrl.prototype] as object;
      const path = Reflect.getMetadata(PATH_METADATA, fn);
      if (path === undefined) return null;
      const verbo = RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn) as number];
      const ruta = [base, path].filter((p) => p && p !== '/').join('/');
      return {
        id: `${verbo} ${ruta}`,
        publica: publicoClase || Reflect.getMetadata(PUBLICO_KEY, fn) === true,
        roles: Reflect.getMetadata(ROLES_KEY, fn) as string[] | undefined,
        permiso: Reflect.getMetadata(PERMISO_KEY, fn) as Permiso | undefined,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

describe('inventario de rutas y matriz de permisos (D-18)', () => {
  const todas = CONTROLADORES.flatMap(rutas);

  it('solo las rutas aprobadas son públicas', () => {
    const publicas = todas.filter((r) => r.publica).map((r) => r.id).sort();
    expect(publicas).toEqual([...PUBLICAS_PERMITIDAS].sort());
  });

  it('cada ruta no pública declara exactamente el permiso de la matriz esperada', () => {
    const privadas = Object.fromEntries(todas.filter((r) => !r.publica).map((r) => [r.id, r.permiso]));
    expect(privadas).toEqual(PERMISO_ESPERADO);
  });

  it('los grupos de cada ruta son los de su permiso en MATRIZ_PERMISOS', () => {
    for (const r of todas.filter((x) => !x.publica)) {
      expect({ ruta: r.id, roles: r.roles }).toEqual({ ruta: r.id, roles: [...MATRIZ_PERMISOS[r.permiso!]] });
    }
  });

  it('el enlace municipal (PersonalSIPINNA) no puede editar la red; el administrador sí', () => {
    expect(permisosDe(['PersonalSIPINNA'])).not.toContain('red.editar');
    expect(permisosDe(['Administrador'])).toContain('red.editar');
    expect(permisosDe([])).toEqual([]);
  });
});
