/**
 * Estatus del reporte (Etapa 1, D-11): mismo color, icono y texto que en la app
 * Android. El color nunca va solo: siempre lo acompañan el icono y el nombre.
 */

/** Los 6 estatus canónicos en el orden del proceso. */
export const ESTATUS = ['Recibido', 'En revisión', 'En atención', 'Canalizado', 'Concluido', 'Descartado'] as const;

/** Iconos Material (Apache 2.0), un trazo por estatus. */
const ICONOS: Record<string, string> = {
  Recibido: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z',
  'En revisión': 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  'En atención': 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  Canalizado: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
  Concluido: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  Descartado: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
};

/**
 * Qué significa cada estatus para quien reportó, en lenguaje sencillo.
 * No promete tiempos de atención.
 */
export const SIGNIFICADO: Record<string, string> = {
  Recibido: 'Tu reporte llegó y está en espera de que el personal lo revise.',
  'En revisión': 'El personal del SIPINNA está revisando la información que enviaste.',
  'En atención': 'El SIPINNA está realizando acciones de atención relacionadas con tu reporte.',
  Canalizado: 'El caso se turnó a la institución que corresponde para que lo atienda.',
  Concluido: 'El SIPINNA terminó su intervención en este caso.',
  Descartado: 'Después de revisarlo, el reporte no pudo atenderse; por ejemplo, porque la información no alcanzó o estaba repetida.',
};

/** Clase CSS del estatus (`estatus-en-revision`, …). */
export function claseEstatus(estatus: string): string {
  return estatus.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '-');
}

/** Icono SVG del estatus, decorativo (el texto va al lado). */
export function IconoEstatus({ estatus, tamano = 16 }: { estatus: string; tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <path d={ICONOS[estatus] ?? ICONOS.Recibido} />
    </svg>
  );
}

/** Etiqueta de estatus: color + icono + texto. */
export function EtiquetaEstatus({ estatus }: { estatus: string }) {
  return (
    <span className={`estatus estatus-${claseEstatus(estatus)}`}>
      <IconoEstatus estatus={estatus} />
      {estatus}
    </span>
  );
}

/** Fecha ISO a texto local en español ("9 de octubre de 2026, 14:30"). */
export function formatearFecha(iso: string, conHora = true): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric', ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}
