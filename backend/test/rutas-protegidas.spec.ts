import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { PUBLICO_KEY, ROLES_KEY, GRUPOS_PERSONAL } from '../src/auth/roles';
import { AuthController } from '../src/auth/auth.controller';
import { ReportesController } from '../src/reportes/reportes.controller';
import { HealthController } from '../src/health/health.controller';
import { AvisosController } from '../src/avisos/aviso-privacidad';
import { CatalogosController } from '../src/catalogos/catalogos.controller';

/**
 * Inventario de rutas públicas (CLAUDE.md, regla 6). Si alguien agrega una ruta
 * pública nueva, esta prueba falla hasta que se agregue aquí a propósito.
 */
const PUBLICAS_PERMITIDAS = new Set([
  'GET health', 'GET health/ready',
  'POST auth/login',
  'POST reportes', 'POST reportes/consulta',
  'GET avisos-privacidad/vigente',
  'GET catalogos',
]);

const CONTROLADORES = [AuthController, ReportesController, HealthController, AvisosController, CatalogosController];

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
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

describe('inventario de rutas', () => {
  const todas = CONTROLADORES.flatMap(rutas);

  it('solo las rutas aprobadas son públicas', () => {
    const publicas = todas.filter((r) => r.publica).map((r) => r.id).sort();
    expect(publicas).toEqual([...PUBLICAS_PERMITIDAS].sort());
  });

  it('toda ruta no pública exige un grupo de personal SIPINNA', () => {
    const privadas = todas.filter((r) => !r.publica);
    expect(privadas.length).toBeGreaterThan(0);
    for (const r of privadas) {
      expect({ ruta: r.id, roles: r.roles }).toEqual({ ruta: r.id, roles: GRUPOS_PERSONAL });
    }
  });
});
