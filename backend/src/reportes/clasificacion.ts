import { BadRequestException } from '@nestjs/common';

/**
 * Reglas de la Fase 6 (documentos del socio formador) como funciones puras:
 * prioridad, categoría de cantidad y formato de folio. Las definiciones
 * provisionales viven **solo aquí** (D-28, D-30).
 */

/** Respuestas a "¿La niña, niño o adolescente está en peligro inmediato?". */
export const PELIGRO = ['Sí', 'No', 'No sé'] as const;
/** Respuesta a la pregunta de peligro inmediato. */
export type Peligro = (typeof PELIGRO)[number];

/** Prioridades del expediente, de mayor a menor. */
export const PRIORIDADES = ['Alta', 'Media', 'Normal'] as const;
/** Prioridad de un reporte. */
export type Prioridad = (typeof PRIORIDADES)[number];

/**
 * Prioridad del reporte (definición provisional, por confirmar con el socio):
 * **Alta** si quien reporta indica peligro inmediato; **Media** si percibe riesgo;
 * **Normal** en el resto. La calcula siempre el servidor: no se acepta del cliente.
 *
 * @param peligroInmediato respuesta a la pregunta de peligro inmediato (null en reportes anteriores)
 * @param situacionRiesgo riesgo percibido (`Sí`, `No`, `No sé`)
 */
export function calcularPrioridad(peligroInmediato: string | null | undefined, situacionRiesgo: string): Prioridad {
  if (peligroInmediato === 'Sí') return 'Alta';
  if (situacionRiesgo === 'Sí') return 'Media';
  return 'Normal';
}

/** Categorías de "¿Cuántas niñas, niños o adolescentes viste?" del formulario del socio. */
export const CANTIDADES = ['1', '2', '3', '4', '5+', 'No sé'] as const;
/** Categoría de cantidad. */
export type Cantidad = (typeof CANTIDADES)[number];

/**
 * Categoría de cantidad que se guarda. Si el cliente la envía, debe ser coherente con
 * la suma de los grupos de edad (`1`–`4` exactos; `5+` al menos 5; `No sé` cualquiera,
 * porque la suma es solo una cota mínima). Si no la envía (clientes anteriores), se deriva.
 *
 * @throws BadRequestException `CANTIDAD_INCOHERENTE`
 */
export function categoriaCantidad(enviada: string | undefined, total: number): Cantidad {
  const derivada: Cantidad = total >= 5 ? '5+' : (String(total) as Cantidad);
  if (enviada === undefined) return derivada;
  const ok = enviada === 'No sé' || (enviada === '5+' ? total >= 5 : enviada === String(total));
  if (!ok) {
    throw new BadRequestException({ codigo: 'CANTIDAD_INCOHERENTE', mensaje: 'La cantidad no coincide con los grupos de edad' });
  }
  return enviada as Cantidad;
}

/** "No sé" del formulario equivale al rango heredado "Sin determinar" (un solo valor en la base y en las estadísticas). */
export function normalizarRango(rango: string): string {
  return rango.trim() === 'No sé' ? 'Sin determinar' : rango.trim();
}

/** Folio heredado `RIETI-2026-000042` o nuevo con clave municipal `RIETI-ATZ-2026-000042`. */
export const PATRON_FOLIO = /^RIETI-(?:[A-Z]{3}-)?\d{4}-\d{6}$/;

/**
 * Folio público. Con clave municipal (Fase 6) para los clientes que se identifican con
 * `canal`; sin ella para los anteriores, que solo saben consultar `RIETI-AAAA-NNNNNN`.
 * El consecutivo es **global por año** (no revela el volumen de cada municipio).
 *
 * @param claveMunicipio clave de 3 letras del municipio, o null para el formato heredado
 */
export function formatearFolio(anio: number, consecutivo: number, claveMunicipio: string | null = null): string {
  const numero = String(consecutivo).padStart(6, '0');
  return claveMunicipio ? `RIETI-${claveMunicipio}-${anio}-${numero}` : `RIETI-${anio}-${numero}`;
}

/** Canales por los que puede llegar un reporte (`whatsapp` queda reservado para una entrada futura). */
export const CANALES = ['app', 'web', 'institucional', 'whatsapp'] as const;
/** Canales que puede declarar un cliente público. */
export const CANALES_PUBLICOS = ['app', 'web'] as const;
