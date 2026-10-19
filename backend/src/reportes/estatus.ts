/**
 * Máquina de estados del reporte (Etapa 1, §3.1; plan §6; Fase 6, catálogo del socio formador).
 *
 * Es la única fuente de verdad de qué cambios de estatus están permitidos.
 * El servicio la consulta antes de guardar, y el detalle del reporte la usa
 * para decirle a la app qué opciones mostrar.
 *
 * Los **nombres internos** no cambian (reglas, pruebas, base de datos y APK
 * anteriores dependen de ellos); lo que ven las personas es la **etiqueta pública**
 * del catálogo del socio (Recibido → Registrado, En atención → En seguimiento,
 * Descartado → Cancelado).
 */

/** Catálogo canónico de estatus (D-11, Fase 6). Los nombres coinciden con `estatus_reporte.nombre`. */
export const ESTATUS = {
  RECIBIDO: 'Recibido',
  EN_REVISION: 'En revisión',
  EN_ATENCION: 'En atención',
  CANALIZADO: 'Canalizado',
  CONCLUIDO: 'Concluido',
  DESCARTADO: 'Descartado',
  ARCHIVADO: 'Archivado',
  REINCIDENTE: 'Reincidente',
} as const;

/** Nombre interno de un estatus del catálogo canónico. */
export type Estatus = (typeof ESTATUS)[keyof typeof ESTATUS];

/** Estatus con el que nace todo reporte. */
export const ESTATUS_INICIAL: Estatus = ESTATUS.RECIBIDO;

/** Lista ordenada de estatus, en el orden en que se muestran en filtros. */
export const ESTATUS_ORDENADOS: readonly Estatus[] = Object.values(ESTATUS);

/** Etiqueta pública de cada estatus (catálogo del socio formador; igual que `estatus_reporte.etiqueta`). */
export const ETIQUETAS: Readonly<Record<Estatus, string>> = {
  [ESTATUS.RECIBIDO]: 'Registrado',
  [ESTATUS.EN_REVISION]: 'En revisión',
  [ESTATUS.EN_ATENCION]: 'En seguimiento',
  [ESTATUS.CANALIZADO]: 'Canalizado',
  [ESTATUS.CONCLUIDO]: 'Concluido',
  [ESTATUS.DESCARTADO]: 'Cancelado',
  [ESTATUS.ARCHIVADO]: 'Archivado',
  [ESTATUS.REINCIDENTE]: 'Reincidente',
};

/** Etiqueta pública de un estatus (el mismo texto si no está en el catálogo). */
export function etiquetaEstatus(nombre: string): string {
  return esEstatus(nombre) ? ETIQUETAS[nombre] : nombre;
}

/** Estatus de un caso cerrado (no cuentan para seguimientos vencidos; Fase 7). */
export const ESTATUS_CERRADOS: readonly Estatus[] = [ESTATUS.CONCLUIDO, ESTATUS.DESCARTADO, ESTATUS.ARCHIVADO];

/** Estatus que cuentan como "pendientes de atender" (también un caso que volvió a requerir atención). */
export const ESTATUS_PENDIENTES: readonly Estatus[] = [ESTATUS.RECIBIDO, ESTATUS.EN_REVISION, ESTATUS.REINCIDENTE];

/**
 * Transiciones válidas: desde → hacia (Fase 6).
 * - Concluido → Archivado (cierre definitivo) o Reincidente (vuelve a requerir atención; exige comentario).
 * - Reincidente → En revisión o En atención.
 * - Archivado y Descartado son terminales; Descartado exige motivo.
 */
export const TRANSICIONES: Readonly<Record<Estatus, readonly Estatus[]>> = {
  [ESTATUS.RECIBIDO]: [ESTATUS.EN_REVISION, ESTATUS.DESCARTADO],
  [ESTATUS.EN_REVISION]: [ESTATUS.EN_ATENCION, ESTATUS.CANALIZADO, ESTATUS.DESCARTADO],
  [ESTATUS.EN_ATENCION]: [ESTATUS.CANALIZADO, ESTATUS.CONCLUIDO],
  [ESTATUS.CANALIZADO]: [ESTATUS.EN_ATENCION, ESTATUS.CONCLUIDO],
  [ESTATUS.CONCLUIDO]: [ESTATUS.ARCHIVADO, ESTATUS.REINCIDENTE],
  [ESTATUS.REINCIDENTE]: [ESTATUS.EN_REVISION, ESTATUS.EN_ATENCION],
  [ESTATUS.ARCHIVADO]: [],
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
    return { codigo: 'TRANSICION_INVALIDA', mensaje: `No se puede pasar de "${etiquetaEstatus(actual)}" a "${etiquetaEstatus(nuevo)}"` };
  }
  if (nuevo === ESTATUS.DESCARTADO && !motivo?.trim()) {
    return { codigo: 'MOTIVO_REQUERIDO', mensaje: 'Para cancelar un reporte se requiere un motivo' };
  }
  if (nuevo === ESTATUS.REINCIDENTE && !comentario?.trim()) {
    return { codigo: 'COMENTARIO_REQUERIDO', mensaje: 'Marcar un caso como reincidente requiere un comentario' };
  }
  return null;
}
