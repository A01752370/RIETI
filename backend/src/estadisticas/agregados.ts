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
  let t = String(valor);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
