import { BadRequestException } from '@nestjs/common';

/**
 * Reglas del formulario de reporte (Fase 2), como funciones puras para poder
 * probarlas sin base de datos. El servicio las usa al registrar un reporte.
 */

/** Tope de menores en un reporte nuevo (suma de los grupos). */
export const TOTAL_MAXIMO_MENORES = 50;

/** Orden de los rangos de edad para desempatar (los más pequeños primero, por ser más vulnerables). */
export const ORDEN_RANGOS = ['0-5', '6-11', '12-17', 'Sin determinar'];

/** Menores observados en un rango de edad. */
export interface Grupo {
  rango: string;
  cantidad: number;
}

/** Lo que el servicio necesita del cuerpo de `POST /reportes` para calcular los grupos. */
export interface EntradaGrupos {
  grupos?: Grupo[];
  cantidadNinos?: number;
  edadAproximada?: string;
}

/** Error 400 con el formato único del API. */
function invalido(codigo: string, mensaje: string): BadRequestException {
  return new BadRequestException({ codigo, mensaje });
}

/**
 * Grupos de edad del reporte.
 *
 * - **Formato nuevo:** `grupos`, sin rangos repetidos y con total ≤ {@link TOTAL_MAXIMO_MENORES}.
 * - **Formato anterior** (APK instaladas): `edadAproximada` + `cantidadNinos` → un solo grupo.
 *
 * @throws BadRequestException `GRUPOS_INVALIDOS` si faltan datos, hay rangos repetidos o se pasa del tope
 */
export function normalizarGrupos(e: EntradaGrupos): Grupo[] {
  if (e.grupos !== undefined) {
    const rangos = e.grupos.map((g) => g.rango.trim());
    if (new Set(rangos).size !== rangos.length) throw invalido('GRUPOS_INVALIDOS', 'Cada grupo de edad debe aparecer una sola vez');
    const total = e.grupos.reduce((s, g) => s + g.cantidad, 0);
    if (total > TOTAL_MAXIMO_MENORES) {
      throw invalido('GRUPOS_INVALIDOS', `El total de niñas, niños y adolescentes no puede pasar de ${TOTAL_MAXIMO_MENORES}`);
    }
    return e.grupos.map((g, i) => ({ rango: rangos[i], cantidad: g.cantidad }));
  }
  if (e.edadAproximada === undefined || e.cantidadNinos === undefined) {
    throw invalido('GRUPOS_INVALIDOS', 'Indica cuántas niñas, niños o adolescentes viste y su edad aproximada');
  }
  return [{ rango: e.edadAproximada.trim(), cantidad: e.cantidadNinos }];
}

/** Suma de menores de todos los grupos. */
export function totalMenores(grupos: Grupo[]): number {
  return grupos.reduce((s, g) => s + g.cantidad, 0);
}

/**
 * Rango "principal" que se guarda en `reporte.id_rango_edad` (columna heredada que
 * siguen leyendo la bandeja y las APK anteriores): el grupo con más menores; en
 * empate, el de menor edad.
 */
export function rangoPrincipal(grupos: Grupo[]): string {
  const posicion = (r: string) => (ORDEN_RANGOS.indexOf(r) === -1 ? ORDEN_RANGOS.length : ORDEN_RANGOS.indexOf(r));
  return [...grupos].sort((a, b) => b.cantidad - a.cantidad || posicion(a.rango) - posicion(b.rango))[0].rango;
}

/** Dirección estructurada del lugar de los hechos. */
export interface Direccion {
  calle: string;
  numeroExterior?: string | null;
  colonia: string;
  codigoPostal: string;
  referencias?: string | null;
}

/** Largo máximo de `ubicacion.descripcion`. */
export const MAX_DESCRIPCION_UBICACION = 300;

/**
 * Texto de ubicación a partir de la dirección (se guarda en `ubicacion.descripcion`,
 * que leen la bandeja y las APK anteriores). Ej.: "Av. López Mateos 12, Col. Centro, C.P. 52900. Ref.: frente al mercado".
 */
export function componerUbicacion(d: Direccion): string {
  const calle = [d.calle.trim(), d.numeroExterior?.trim()].filter(Boolean).join(' ');
  const base = `${calle}, Col. ${d.colonia.trim()}, C.P. ${d.codigoPostal}`;
  const ref = d.referencias?.trim();
  const texto = ref ? `${base}. Ref.: ${ref}` : base;
  return texto.length <= MAX_DESCRIPCION_UBICACION ? texto : `${texto.slice(0, MAX_DESCRIPCION_UBICACION - 1)}…`;
}

/** Los códigos postales del Estado de México van de 50000 a 57999 (exclusivos del estado). */
export function esCodigoPostalEdomex(cp: string): boolean {
  if (!/^\d{5}$/.test(cp)) return false;
  const n = Number(cp);
  return n >= 50000 && n <= 57999;
}

/**
 * Redondea una coordenada a 5 decimales (≈ 1 m). Más precisión es falsa (un GPS
 * de teléfono no la tiene) y solo aumenta lo que se podría inferir del dato.
 */
export function redondearCoordenada(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : Math.round(v * 1e5) / 1e5;
}
