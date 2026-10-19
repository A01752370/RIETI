/**
 * Lógica pura de las estadísticas del personal (Fase 3), separada para probarla
 * sin base de datos.
 */

/**
 * Umbral mínimo de celda: un conteo menor se oculta (`total: null`) para que
 * una celda muy pequeña (p. ej. "1 reporte en tal colonia con tal actividad") no
 * permita reidentificar un caso. Configurable con `ESTADISTICAS_UMBRAL`.
 */
export function umbralMinimo(): number {
  const v = Number(process.env.ESTADISTICAS_UMBRAL ?? 3);
  return Number.isInteger(v) && v >= 1 ? v : 3;
}

/** Conteo que puede ocultarse por el umbral. */
export interface ConteoProtegidoDto {
  etiqueta: string;
  /** null si el conteo es menor que el umbral (se muestra como "menos de N"). */
  total: number | null;
}

/** Aplica el umbral: los conteos menores se ocultan. Conserva el orden. */
export function proteger(conteos: { etiqueta: string; total: number }[], umbral: number): ConteoProtegidoDto[] {
  return conteos.map((c) => ({ etiqueta: c.etiqueta, total: c.total >= umbral ? c.total : null }));
}

/** Evento de la bitácora de un caso. */
export interface EventoCaso {
  idCaso: number;
  estatus: string;
  fecha: Date;
}

/** Tiempo promedio en un estatus. */
export interface TiempoEstatusDto {
  estatus: string;
  /** Promedio en horas (1 decimal), o null si hay menos casos que el umbral. */
  horasPromedio: number | null;
  /** Casos que pasaron por ese estatus y ya salieron de él. */
  casos: number;
}

/**
 * Tiempo que cada caso permaneció en cada estatus, a partir de la bitácora
 * (eventos ordenados). Los eventos repetidos del mismo estatus (notas) no
 * cuentan como cambio. El estatus vigente no se mide (aún no termina).
 *
 * @returns promedio por estatus, en el orden de `ordenEstatus`
 */
export function tiemposPorEstatus(eventos: EventoCaso[], ordenEstatus: readonly string[], umbral: number): TiempoEstatusDto[] {
  const porCaso = new Map<number, EventoCaso[]>();
  for (const e of eventos) {
    const lista = porCaso.get(e.idCaso) ?? [];
    lista.push(e);
    porCaso.set(e.idCaso, lista);
  }
  const duraciones = new Map<string, number[]>();
  for (const lista of porCaso.values()) {
    lista.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    const cambios = lista.filter((e, i) => i === 0 || e.estatus !== lista[i - 1].estatus);
    for (let i = 0; i < cambios.length - 1; i++) {
      const horas = (cambios[i + 1].fecha.getTime() - cambios[i].fecha.getTime()) / 3_600_000;
      const d = duraciones.get(cambios[i].estatus) ?? [];
      d.push(horas);
      duraciones.set(cambios[i].estatus, d);
    }
  }
  return ordenEstatus.map((estatus) => {
    const d = duraciones.get(estatus) ?? [];
    const promedio = d.length >= umbral && d.length > 0 ? Math.round((d.reduce((a, b) => a + b, 0) / d.length) * 10) / 10 : null;
    return { estatus, horasPromedio: promedio, casos: d.length };
  });
}

/**
 * Mínimo de casos para publicar un tiempo promedio de proceso (Fase 5). Con
 * menos casos un promedio engaña (un solo caso lento o rápido lo domina), así
 * que se responde "datos insuficientes". Nunca es menor que el umbral de celda.
 */
export function minimoCasosTiempo(umbral: number): number {
  const v = Number(process.env.ESTADISTICAS_MIN_CASOS_TIEMPO ?? 5);
  return Math.max(umbral, Number.isInteger(v) && v >= 1 ? v : 5);
}

/** Tiempo de proceso hasta un hito (primera revisión o conclusión). */
export interface TiempoHitoDto {
  /** Promedio en horas (1 decimal), o null si hay menos de `minimoCasos` casos. */
  horasPromedio: number | null;
  /** Mediana en horas (1 decimal), o null en el mismo caso: no la desvían los casos extremos. */
  horasMediana: number | null;
  /** Casos que ya alcanzaron el hito (los que no lo alcanzan no se cuentan). */
  casos: number;
  /** Casos necesarios para publicar el promedio. */
  minimoCasos: number;
}

/**
 * Tiempo desde el alta (primer evento) hasta el primer evento que cumple `hito`,
 * por caso. Los casos que nunca lo alcanzan no se cuentan (aún no terminan).
 */
export function tiempoHastaHito(eventos: EventoCaso[], hito: (estatus: string) => boolean, minimoCasos: number): TiempoHitoDto {
  const porCaso = new Map<number, EventoCaso[]>();
  for (const e of eventos) porCaso.set(e.idCaso, [...(porCaso.get(e.idCaso) ?? []), e]);
  const horas: number[] = [];
  for (const lista of porCaso.values()) {
    lista.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    const alcanzado = lista.slice(1).find((e) => hito(e.estatus));
    if (alcanzado) horas.push((alcanzado.fecha.getTime() - lista[0].fecha.getTime()) / 3_600_000);
  }
  const redondear = (h: number) => Math.round(h * 10) / 10;
  if (horas.length < minimoCasos || horas.length === 0) return { horasPromedio: null, horasMediana: null, casos: horas.length, minimoCasos };
  const orden = [...horas].sort((a, b) => a - b);
  const mitad = Math.floor(orden.length / 2);
  const mediana = orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2;
  return { horasPromedio: redondear(horas.reduce((a, b) => a + b, 0) / horas.length), horasMediana: redondear(mediana), casos: horas.length, minimoCasos };
}

/** Tamaño de la celda del mapa de calor, en grados (≈ 550 m en la latitud del Estado de México). */
export const TAMANO_CELDA_GRADOS = 0.005;

/** Celda del mapa de calor. */
export interface CeldaCalorDto {
  /** Centro de la celda (no la ubicación de ningún reporte). */
  lat: number;
  lng: number;
  total: number;
}

/**
 * Agrupa puntos en una rejilla y oculta las celdas con menos reportes que el
 * umbral. Devuelve el centro de cada celda, nunca coordenadas de reportes.
 */
export function celdasDeCalor(puntos: { lat: number; lng: number }[], umbral: number): { celdas: CeldaCalorDto[]; ocultas: number } {
  const conteo = new Map<string, { lat: number; lng: number; total: number }>();
  for (const p of puntos) {
    const i = Math.floor(p.lat / TAMANO_CELDA_GRADOS);
    const j = Math.floor(p.lng / TAMANO_CELDA_GRADOS);
    const llave = `${i},${j}`;
    const c = conteo.get(llave) ?? {
      lat: Number(((i + 0.5) * TAMANO_CELDA_GRADOS).toFixed(5)),
      lng: Number(((j + 0.5) * TAMANO_CELDA_GRADOS).toFixed(5)),
      total: 0,
    };
    c.total++;
    conteo.set(llave, c);
  }
  const todas = [...conteo.values()];
  const celdas = todas.filter((c) => c.total >= umbral).sort((a, b) => b.total - a.total);
  return { celdas, ocultas: todas.length - celdas.length };
}

/**
 * Escapa un valor para CSV y neutraliza la inyección de fórmulas: si empieza
 * con `=`, `+`, `-`, `@`, tabulador o retorno, se antepone un apóstrofo para que
 * Excel u hojas de cálculo no lo ejecuten.
 */
export function celdaCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  // Un número (también negativo) no es una fórmula: se escribe tal cual.
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor);
  let t = String(valor);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
