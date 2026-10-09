/**
 * Máquina de estados del reporte (Etapa 1, §3.1; plan §6).
 *
 * Es la única fuente de verdad de qué cambios de estatus están permitidos.
 * El servicio la consulta antes de guardar, y el detalle del reporte la usa
 * para decirle a la app qué opciones mostrar.
 */

/** Catálogo canónico de estatus (D-11). Los nombres coinciden con `estatus_reporte.nombre`. */
export const ESTATUS = {
  RECIBIDO: 'Recibido',
  EN_REVISION: 'En revisión',
  EN_ATENCION: 'En atención',
  CANALIZADO: 'Canalizado',
  CONCLUIDO: 'Concluido',
  DESCARTADO: 'Descartado',
} as const;

/** Nombre de un estatus del catálogo canónico. */
export type Estatus = (typeof ESTATUS)[keyof typeof ESTATUS];

/** Estatus con el que nace todo reporte. */
export const ESTATUS_INICIAL: Estatus = ESTATUS.RECIBIDO;

/** Lista ordenada de estatus, en el orden en que se muestran en filtros. */
export const ESTATUS_ORDENADOS: readonly Estatus[] = Object.values(ESTATUS);

/**
 * Transiciones válidas: desde → hacia.
 * `Concluido → En atención` solo procede por reincidencia; se exige comentario.
 * `Descartado` es terminal y exige motivo.
 */
export const TRANSICIONES: Readonly<Record<Estatus, readonly Estatus[]>> = {
  [ESTATUS.RECIBIDO]: [ESTATUS.EN_REVISION, ESTATUS.DESCARTADO],
  [ESTATUS.EN_REVISION]: [ESTATUS.EN_ATENCION, ESTATUS.CANALIZADO, ESTATUS.DESCARTADO],
  [ESTATUS.EN_ATENCION]: [ESTATUS.CANALIZADO, ESTATUS.CONCLUIDO],
  [ESTATUS.CANALIZADO]: [ESTATUS.CONCLUIDO],
  [ESTATUS.CONCLUIDO]: [ESTATUS.EN_ATENCION],
  [ESTATUS.DESCARTADO]: [],
};

/** Indica si `valor` es un nombre de estatus del catálogo canónico. */
export function esEstatus(valor: string): valor is Estatus {
  return (ESTATUS_ORDENADOS as readonly string[]).includes(valor);
}

/** Estatus a los que se puede pasar desde `actual` (vacío si es terminal o desconocido). */
export function transicionesPermitidas(actual: string): Estatus[] {
  return esEstatus(actual) ? [...TRANSICIONES[actual]] : [];
}

/** Resultado de validar un cambio de estatus: `null` si es válido o el motivo del rechazo. */
export type ErrorTransicion =
  | { codigo: 'ESTATUS_DESCONOCIDO'; mensaje: string }
  | { codigo: 'TRANSICION_INVALIDA'; mensaje: string }
  | { codigo: 'MOTIVO_REQUERIDO'; mensaje: string }
  | { codigo: 'COMENTARIO_REQUERIDO'; mensaje: string };

/**
 * Valida un cambio de estatus contra la tabla de transiciones.
 *
 * @param actual estatus actual del caso
 * @param nuevo estatus solicitado
 * @param comentario comentario de seguimiento (puede venir vacío)
 * @param motivo motivo de descarte (obligatorio si `nuevo` es Descartado)
 * @returns `null` si el cambio es válido; si no, el error con su código
 */
export function validarTransicion(
  actual: string,
  nuevo: string,
  comentario?: string | null,
  motivo?: string | null,
): ErrorTransicion | null {
  if (!esEstatus(nuevo)) {
    return { codigo: 'ESTATUS_DESCONOCIDO', mensaje: `Estatus desconocido: "${nuevo}"` };
  }
  if (!transicionesPermitidas(actual).includes(nuevo)) {
    return { codigo: 'TRANSICION_INVALIDA', mensaje: `No se puede pasar de "${actual}" a "${nuevo}"` };
  }
  if (nuevo === ESTATUS.DESCARTADO && !motivo?.trim()) {
    return { codigo: 'MOTIVO_REQUERIDO', mensaje: 'Para descartar un reporte se requiere un motivo' };
  }
  if (actual === ESTATUS.CONCLUIDO && !comentario?.trim()) {
    return { codigo: 'COMENTARIO_REQUERIDO', mensaje: 'Reabrir un caso concluido requiere un comentario (reincidencia)' };
  }
  return null;
}
