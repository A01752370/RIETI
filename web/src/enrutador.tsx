import { MouseEvent, ReactNode, useEffect, useSyncExternalStore } from 'react';

/**
 * Enrutador mínimo con la History API (sin dependencias). El backend devuelve
 * `index.html` para cualquier ruta que no sea del API, así que las URL son
 * normales (`/reportar`, `/seguimiento`, …) y se pueden compartir.
 */

const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((fn) => fn());
if (typeof window !== 'undefined') window.addEventListener('popstate', avisar);

/** Navega a una ruta interna sin recargar la página. */
export function navegar(ruta: string, opciones: { reemplazar?: boolean } = {}): void {
  if (opciones.reemplazar) window.history.replaceState(null, '', ruta);
  else window.history.pushState(null, '', ruta);
  window.scrollTo(0, 0);
  avisar();
}

/** Ruta actual (pathname) que se actualiza al navegar. */
export function useRuta(): string {
  return useSyncExternalStore(
    (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); },
    () => window.location.pathname,
  );
}

/**
 * Compara una ruta con un patrón tipo `/personal/reportes/:id`.
 * @returns los parámetros, o null si no coincide
 */
export function coincide(patron: string, ruta: string): Record<string, string> | null {
  const p = patron.split('/').filter(Boolean), r = ruta.replace(/\/+$/, '').split('/').filter(Boolean);
  if (p.length !== r.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(r[i]);
    else if (p[i] !== r[i]) return null;
  }
  return params;
}

/** Enlace interno: navega sin recargar y marca `aria-current` si es la página actual. */
export function Enlace({ a, children, className }: { a: string; children: ReactNode; className?: string }) {
  const ruta = useRuta();
  const alClic = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navegar(a);
  };
  return (
    <a href={a} onClick={alClic} className={className} aria-current={ruta === a ? 'page' : undefined}>
      {children}
    </a>
  );
}

/** Cambia el título del documento (lo anuncian los lectores de pantalla al navegar). */
export function useTitulo(titulo: string): void {
  useEffect(() => { document.title = `${titulo} · RIETI`; }, [titulo]);
}
