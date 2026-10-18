import { claseEstatus, formatearFecha, IconoEstatus, SIGNIFICADO } from './estatus';

/**
 * Componentes de progreso (Fase 5): indicador de pasos del asistente, barra de
 * progreso segmentada y línea de progreso del estatus de un reporte. Las mismas
 * reglas que en la app Android (`ComponentesProgreso.kt`, `LineaEstatus.kt`).
 * Sin estilos en línea: todo con clases (la CSP los bloquearía).
 */

/** Avance normal de un reporte, en orden. "Descartado" no forma parte: es un final distinto. */
export const FLUJO = ['Recibido', 'En revisión', 'En atención', 'Canalizado', 'Concluido'] as const;

/** Cómo se dibuja cada paso de la línea. */
export type EstadoPaso = 'alcanzado' | 'actual' | 'pendiente' | 'omitido';

/** Un paso de la línea de progreso. */
export interface PasoLinea { estatus: string; estado: EstadoPaso; fecha: string | null }

/** Línea calculada: pasos del avance normal, final "Descartado" (si aplica) y la frase de la etapa actual. */
export interface Linea { pasos: PasoLinea[]; descartado: PasoLinea | null; significado: string }

/**
 * Calcula la línea a partir del estatus vigente y del historial público (solo
 * estatus y fechas: nunca comentarios ni notas del personal).
 *
 * @param actual estatus vigente
 * @param historial cambios del más antiguo al más reciente (puede venir vacío)
 * @param fechaAlta fecha de registro, por si el historial viene vacío (pantalla de folio)
 */
export function calcularLinea(actual: string, historial: { estatus: string; fecha: string }[], fechaAlta?: string): Linea {
  const ultima = (e: string) => [...historial].reverse().find((h) => h.estatus === e)?.fecha ?? null;
  const alcanzados = new Set([...historial.map((h) => h.estatus), actual]);
  const fechaDe = (e: string) => ultima(e) ?? (e === 'Recibido' ? fechaAlta ?? null : null);
  const significado = SIGNIFICADO[actual] ?? 'Tu reporte está en seguimiento.';

  if (actual === 'Descartado') {
    return {
      pasos: FLUJO.filter((e) => alcanzados.has(e) || e === 'Recibido').map((e) => ({ estatus: e, estado: 'alcanzado', fecha: fechaDe(e) })),
      descartado: { estatus: 'Descartado', estado: 'actual', fecha: ultima('Descartado') },
      significado,
    };
  }
  const indice = Math.max(0, (FLUJO as readonly string[]).indexOf(actual));
  const pasos = FLUJO.map((e, i): PasoLinea => {
    if (i === indice) return { estatus: e, estado: 'actual', fecha: fechaDe(e) };
    if (i > indice) return { estatus: e, estado: 'pendiente', fecha: null };
    return alcanzados.has(e) || e === 'Recibido'
      ? { estatus: e, estado: 'alcanzado', fecha: fechaDe(e) }
      : { estatus: e, estado: 'omitido', fecha: null };
  });
  return { pasos, descartado: null, significado };
}

/** Palomita (icono Material, Apache 2.0). */
function Palomita() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

/**
 * Línea de progreso del estatus de un reporte. Pasos alcanzados con palomita y
 * fecha, el actual resaltado con su color e icono, los pendientes atenuados;
 * "Descartado" aparte, como final distinto.
 *
 * @param linea línea calculada con {@link calcularLinea}
 * @param conSignificado muestra debajo la frase en lenguaje simple de la etapa actual
 * @param titulo nombre accesible de la lista
 */
export function LineaProgreso({ linea, conSignificado = true, titulo = 'Avance del reporte' }: { linea: Linea; conSignificado?: boolean; titulo?: string }) {
  return (
    <div className="linea-progreso">
      <ol aria-label={titulo}>
        {linea.pasos.map((p) => (
          <li key={p.estatus} className={`paso-linea paso-${p.estado}`} aria-current={p.estado === 'actual' ? 'step' : undefined}>
            <span className={p.estado === 'actual' ? `marca marca-actual relleno-fondo-${claseEstatus(p.estatus)}` : `marca marca-${p.estado}`} aria-hidden="true">
              {p.estado === 'alcanzado' && <Palomita />}
              {p.estado === 'actual' && <IconoEstatus estatus={p.estatus} tamano={18} />}
            </span>
            <span className="paso-texto">
              <strong>{p.estatus}</strong>
              <span className="pequeno texto-secundario">
                {p.estado === 'actual' && (p.fecha ? `Etapa actual · desde el ${formatearFecha(p.fecha)}` : 'Etapa actual')}
                {p.estado === 'alcanzado' && (p.fecha ? formatearFecha(p.fecha) : 'Completada')}
                {p.estado === 'pendiente' && 'Pendiente'}
                {p.estado === 'omitido' && 'No fue necesaria en este caso'}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {linea.descartado && (
        <div className="final-descartado" role="note">
          <span className="estatus estatus-descartado"><IconoEstatus estatus="Descartado" />Descartado</span>
          {linea.descartado.fecha && <span className="pequeno"> {formatearFecha(linea.descartado.fecha)}</span>}
          <p>El reporte se cerró sin continuar el avance normal.</p>
        </div>
      )}
      {conSignificado && <p className="significado">{linea.significado}</p>}
    </div>
  );
}

/**
 * Indicador de pasos del asistente: completados con palomita, el actual con
 * halo y `aria-current="step"`, pendientes solo con borde. Los pasos ya
 * visitados se pueden tocar para volver.
 *
 * @param pasos nombres de los pasos
 * @param actual índice del paso actual (desde 0)
 * @param maximo índice del paso más avanzado ya visitado
 * @param alElegir se llama al elegir un paso ya visitado
 */
export function IndicadorPasos({ pasos, actual, maximo = actual, alElegir }: {
  pasos: string[]; actual: number; maximo?: number; alElegir?: (i: number) => void;
}) {
  return (
    <nav aria-label="Pasos del reporte" className="indicador-pasos">
      <ol>
        {pasos.map((nombre, i) => {
          const estado = i < actual ? 'completo' : i === actual ? 'actual' : 'pendiente';
          const contenido = (
            <>
              <span className="circulo" aria-hidden="true">{estado === 'completo' ? <Palomita /> : i + 1}</span>
              <span className="nombre">{nombre}</span>
              <span className="solo-lectores">{estado === 'completo' ? ' (completado)' : estado === 'pendiente' ? ' (pendiente)' : ''}</span>
            </>
          );
          return (
            <li key={nombre} className={`paso paso-${estado}`} aria-current={i === actual ? 'step' : undefined}>
              {alElegir && i <= maximo && i !== actual
                ? <button type="button" className="paso-boton" onClick={() => alElegir(i)}>{contenido}<span className="solo-lectores">: volver a este paso</span></button>
                : <span className="paso-boton">{contenido}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Barra de progreso segmentada con el texto "Paso 2 de 4 · A quiénes"
 * (`role="progressbar"` con sus valores).
 */
export function BarraProgreso({ total, actual, nombre }: { total: number; actual: number; nombre: string }) {
  return (
    <div className="barra-progreso">
      <p className="pequeno texto-secundario" aria-hidden="true">Paso {actual + 1} de {total} · {nombre}</p>
      <div role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={actual + 1}
        aria-valuetext={`Paso ${actual + 1} de ${total}: ${nombre}`} aria-label="Progreso del reporte" className="segmentos">
        {Array.from({ length: total }, (_, i) => <span key={i} className={i <= actual ? 'segmento segmento-lleno' : 'segmento'} />)}
      </div>
    </div>
  );
}
