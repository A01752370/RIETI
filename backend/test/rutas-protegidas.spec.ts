import { MATRIZ_PERMISOS, Permiso, permisosDe } from '../src/auth/roles';
import { todasLasRutas } from './utilidades/rutas';

/**
 * Inventario de rutas públicas (docs/GUIA-DESARROLLO.md, regla 6). Si alguien agrega una ruta
 * pública nueva, esta prueba falla hasta que se agregue aquí a propósito.
 */
const PUBLICAS_PERMITIDAS = new Set([
  'GET health', 'GET health/ready',
  'POST auth/login',
  'POST reportes', 'POST reportes/consulta',
  'GET avisos-privacidad/vigente',
  'GET catalogos', 'GET catalogos/municipios', 'GET catalogos/actividades',
  'GET geo/reversa', 'GET geo/teselas/:z/:x/:y.png',
  'POST ciudadanos/registro', 'POST ciudadanos/confirmar', 'POST ciudadanos/reenviar-codigo', 'POST ciudadanos/login',
  'POST ciudadanos/refresh', 'POST ciudadanos/olvide-contrasena', 'POST ciudadanos/restablecer-contrasena',
  'GET red-municipios',
]);

/**
 * Matriz esperada ruta → permiso (docs/seguridad/roles-y-permisos.md). Si una
 * ruta del personal cambia de permiso o aparece una nueva, esta prueba falla.
 */
/** Rutas de la cuenta de ciudadano (Fase 4): solo tokens del pool de ciudadanos. */
const CIUDADANO_ESPERADAS = [
  'GET ciudadano/cuenta', 'POST ciudadano/cuenta/contrasena', 'POST ciudadano/cuenta/cerrar-sesion',
  'DELETE ciudadano/cuenta', 'GET ciudadano/reportes',
];

const PERMISO_ESPERADO: Record<string, Permiso> = {
  'GET reportes': 'reportes.ver',
  'GET reportes/:id': 'reportes.ver',
  'PATCH reportes/:id/estatus': 'reportes.gestionar',
  'POST reportes/:id/seguimientos': 'reportes.gestionar',
  'GET estadisticas/resumen': 'estadisticas.ver',
  'GET estadisticas/distribuciones': 'estadisticas.ver',
  'GET estadisticas/tiempos': 'estadisticas.ver',
  'GET estadisticas/sin-atender': 'estadisticas.ver',
  'GET estadisticas/mapa-calor': 'estadisticas.ver',
  'GET reportes/exportar.csv': 'reportes.exportar',
  'PUT red-municipios/:municipioId': 'red.editar',
  'GET auth/perfil': 'perfil.ver',
  // Fase 7: expediente, alertas y administración.
  'PATCH reportes/:id/expediente': 'expediente.editar',
  'GET reportes/:id/cercanos': 'reportes.ver',
  'POST reportes/:id/duplicado': 'expediente.editar',
  'DELETE reportes/:id/duplicado': 'expediente.editar',
  'GET reportes/:id/responsables': 'expediente.editar',
  'GET catalogos/expediente': 'reportes.ver',
  'GET estadisticas/embudo': 'estadisticas.ver',
  'GET alertas': 'alertas.ver',
  'PATCH alertas/:id': 'alertas.gestionar',
  'GET admin/personal': 'personal.administrar',
  'PUT admin/personal/:id/municipios': 'personal.administrar',
  'GET admin/configuracion': 'configuracion.editar',
  'PUT admin/configuracion': 'configuracion.editar',
  'GET admin/dependencias': 'configuracion.editar',
  'POST admin/dependencias': 'configuracion.editar',
  'PATCH admin/dependencias/:id': 'configuracion.editar',
  'GET admin/accesos': 'accesos.ver',
};

describe('inventario de rutas y matriz de permisos (D-18)', () => {
  const todas = todasLasRutas();

  it('solo las rutas aprobadas son públicas', () => {
    const publicas = todas.filter((r) => r.publica).map((r) => r.id).sort();
    expect(publicas).toEqual([...PUBLICAS_PERMITIDAS].sort());
  });

  it('las rutas de cuenta de ciudadano exigen el token del pool de ciudadanos y no tienen permisos del personal (Fase 4)', () => {
    const deCiudadano = todas.filter((r) => r.ciudadano === 'requerido');
    expect(deCiudadano.map((r) => r.id).sort()).toEqual(CIUDADANO_ESPERADAS.sort());
    for (const r of deCiudadano) expect({ ruta: r.id, roles: r.roles, permiso: r.permiso }).toEqual({ ruta: r.id, roles: undefined, permiso: undefined });
    // Solo POST /reportes acepta un token de ciudadano opcional, y sigue siendo pública.
    expect(todas.filter((r) => r.ciudadano === 'opcional').map((r) => [r.id, r.publica])).toEqual([['POST reportes', true]]);
  });

  it('cada ruta del personal declara exactamente el permiso de la matriz esperada', () => {
    const privadas = Object.fromEntries(todas.filter((r) => !r.publica && !r.ciudadano).map((r) => [r.id, r.permiso]));
    expect(privadas).toEqual(PERMISO_ESPERADO);
  });

  it('los grupos de cada ruta son los de su permiso en MATRIZ_PERMISOS', () => {
    for (const r of todas.filter((x) => !x.publica && !x.ciudadano)) {
      expect({ ruta: r.id, roles: r.roles }).toEqual({ ruta: r.id, roles: [...MATRIZ_PERMISOS[r.permiso!]] });
    }
  });

  it('solo el administrador asigna municipios, edita parámetros y ve la bitácora de accesos (Fase 7)', () => {
    for (const p of ['personal.administrar', 'configuracion.editar', 'accesos.ver'] as Permiso[]) {
      expect(permisosDe(['Administrador'])).toContain(p);
      expect(permisosDe(['CoordinadorRegional'])).not.toContain(p);
      expect(permisosDe(['PersonalSIPINNA'])).not.toContain(p);
    }
    expect(permisosDe(['CoordinadorRegional'])).toEqual(expect.arrayContaining(['reportes.ver', 'expediente.editar', 'alertas.ver']));
  });

  it('el enlace municipal (PersonalSIPINNA) no puede editar la red; el administrador sí', () => {
    expect(permisosDe(['PersonalSIPINNA'])).not.toContain('red.editar');
    expect(permisosDe(['Administrador'])).toContain('red.editar');
    expect(permisosDe([])).toEqual([]);
  });
});
