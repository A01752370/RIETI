/**
 * Inteligencia territorial (Fase 9): funciones puras para normalizar colonias, redondear
 * celdas y redactar hallazgos automáticos a partir de los datos reales. Sin acceso a la base.
 */

/** Días de la semana en español (0 = domingo, como `extract(dow ...)`). */
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Reportes mínimos en una zona para redactar un hallazgo sobre ella. */
export const MINIMO_HALLAZGO = 5;

/** Tamaño de la zona de los hallazgos (grados; ≈ 165 m). */
export const CELDA_HALLAZGO = 0.0015;

/** Celda de la base regional anonimizada (3 decimales ≈ 110 m). */
export const DECIMALES_BASE_REGIONAL = 3;

/**
 * Colonia normalizada para agrupar (mejor esfuerzo): minúsculas, sin acentos, sin el
 * prefijo "Col." ni signos, espacios simples. `null` si queda vacía.
 */
export function normalizarColonia(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const limpio = texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\s*(col(onia)?|fracc(ionamiento)?|barrio|bo|unidad|u\.?\s*hab\.?)[.\s]+/, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpio || null;
}

/** Redondea una coordenada a `decimales` (celda). */
export function redondear(valor: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}

/** Un reporte para calcular hallazgos (sin datos personales). */
export interface ReporteHallazgo {
  lat: number;
  lng: number;
  /** Día de la semana (0 = domingo) en la hora de la Ciudad de México. */
  dia: number;
  /** Hora 0–23 en la Ciudad de México. */
  hora: number;
  colonia: string | null;
  municipio: string | null;
}

/** Hallazgo redactado. */
export interface HallazgoDto {
  texto: string;
  reportes: number;
  /** Centro aproximado de la zona (para centrar el mapa; nunca la coordenada de un reporte). */
  lat: number;
  lng: number;
}

/** Ventana de horas contigua (de `ancho` horas) con más reportes. */
export function mejorVentanaHoras(horas: number[], ancho = 4): { desde: number; hasta: number; total: number } {
  const porHora = Array.from({ length: 24 }, (_, h) => horas.filter((x) => x === h).length);
  let mejor = { desde: 0, hasta: ancho, total: -1 };
  for (let h = 0; h <= 24 - ancho; h++) {
    const total = porHora.slice(h, h + ancho).reduce((a, b) => a + b, 0);
    if (total > mejor.total) mejor = { desde: h, hasta: h + ancho, total };
  }
  return mejor;
}

/**
 * Días que concentran los reportes: un solo día si reúne el 60 % o más; si no, los dos más
 * frecuentes cuando juntos reúnen al menos la mitad. `null` si no hay patrón.
 */
export function diasPrincipales(dias: number[]): number[] | null {
  const conteo = DIAS.map((_, d) => ({ d, n: dias.filter((x) => x === d).length })).sort((a, b) => b.n - a.n || a.d - b.d);
  const total = dias.length;
  if (conteo[0].n * 10 >= total * 6) return [conteo[0].d];
  if ((conteo[0].n + conteo[1].n) * 2 >= total) return [conteo[0].d, conteo[1].d].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  return null;
}

const listaDias = (d: number[]) => d.map((x) => (x === 6 || x === 0 ? `${DIAS[x]}s` : `${DIAS[x]}`)).join(' y ');
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/**
 * Hallazgos automáticos por zona (≈ 165 m): solo zonas con al menos `minimo` reportes, y
 * solo se menciona un patrón de días u horas si concentra la mitad de los reportes o más.
 * El lugar se describe por la colonia más frecuente (si la hay) y el municipio.
 *
 * @param meses periodo de los datos, para el texto ("en los últimos 3 meses")
 */
export function hallazgosPorZona(reportes: ReporteHallazgo[], meses: number, minimo = MINIMO_HALLAZGO, maximo = 3): HallazgoDto[] {
  const zonas = new Map<string, ReporteHallazgo[]>();
  for (const r of reportes) {
    const clave = `${Math.floor(r.lat / CELDA_HALLAZGO)}:${Math.floor(r.lng / CELDA_HALLAZGO)}`;
    zonas.set(clave, [...(zonas.get(clave) ?? []), r]);
  }
  return [...zonas.entries()]
    .filter(([, lista]) => lista.length >= minimo)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, maximo)
    .map(([clave, lista]) => {
      const [fy, fx] = clave.split(':').map(Number);
      const colonias = lista.map((r) => r.colonia).filter((c): c is string => Boolean(c));
      const coloniaFrecuente = colonias.sort((a, b) => colonias.filter((x) => x === b).length - colonias.filter((x) => x === a).length)[0];
      const municipio = lista.find((r) => r.municipio)?.municipio;
      const lugar = coloniaFrecuente ? `la colonia ${coloniaFrecuente}${municipio ? `, ${municipio}` : ''}` : `una zona de ${municipio ?? 'la región'}`;
      const periodo = meses === 1 ? 'el último mes' : `los últimos ${meses} meses`;
      const dias = diasPrincipales(lista.map((r) => r.dia));
      const ventana = mejorVentanaHoras(lista.map((r) => r.hora));
      const patronHora = ventana.total * 2 >= lista.length;
      const patron = [dias && `principalmente ${listaDias(dias)}`, patronHora && `${dias ? 'entre' : 'principalmente entre'} ${hh(ventana.desde)} y ${hh(ventana.hasta)} h`]
        .filter(Boolean).join(' ');
      return {
        texto: `En ${lugar} se han recibido ${lista.length} reportes en ${periodo}${patron ? `, ${patron}` : ''}.`,
        reportes: lista.length,
        lat: redondear((fy + 0.5) * CELDA_HALLAZGO, 4),
        lng: redondear((fx + 0.5) * CELDA_HALLAZGO, 4),
      };
    });
}

/** Valor más frecuente con su conteo, o null si no hay datos. */
export function masFrecuente(valores: (string | null)[]): { valor: string; n: number } | null {
  const conteo = new Map<string, number>();
  for (const v of valores) if (v) conteo.set(v, (conteo.get(v) ?? 0) + 1);
  const [valor, n] = [...conteo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];
  return valor ? { valor, n: n! } : null;
}
