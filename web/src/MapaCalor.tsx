import { useEffect, useRef } from 'react';
import type { CeldaCalor } from './api';

/** Mismo rectángulo que el servidor: fuera de él no hay teselas. */
const LIMITES: [[number, number], [number, number]] = [[18.3, -100.65], [20.35, -98.55]];

/**
 * Mapa de calor del panel (Fase 3). Leaflet y el plugin de calor se cargan
 * **solo aquí y bajo demanda** (import dinámico), así que la web pública no los
 * descarga. Las teselas salen de nuestro API (`/api/v1/geo/teselas`), por lo que
 * la CSP (`img-src 'self'`) no tuvo que cambiar y el navegador no contacta a
 * terceros. Los puntos son centros de celdas de ≈ 550 m que manda el servidor,
 * nunca ubicaciones de reportes.
 *
 * @param celdas celdas con su conteo
 * @param resumen texto alternativo para lectores de pantalla
 */
export default function MapaCalor({ celdas, resumen }: { celdas: CeldaCalor[]; resumen: string }) {
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    let quitar: (() => void) | undefined;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      // leaflet.heat se registra sobre el objeto global L.
      (window as unknown as { L: typeof L }).L = L;
      await import('leaflet.heat');
      if (cancelado || !contenedor.current) return;

      const mapa = L.map(contenedor.current, {
        minZoom: 8, maxZoom: 18, maxBounds: LIMITES, maxBoundsViscosity: 1, attributionControl: false,
      }).setView([19.55, -99.25], 10);
      L.control.attribution({ prefix: false }).addAttribution('© colaboradores de OpenStreetMap').addTo(mapa);
      L.tileLayer('/api/v1/geo/teselas/{z}/{x}/{y}.png', { minZoom: 8, maxZoom: 18, bounds: LIMITES }).addTo(mapa);

      const max = Math.max(1, ...celdas.map((c) => c.total));
      const capa = (L as unknown as { heatLayer: (p: [number, number, number][], o: object) => { addTo: (m: unknown) => void } })
        .heatLayer(celdas.map((c) => [c.lat, c.lng, c.total / max]), { radius: 30, blur: 18, maxZoom: 14, minOpacity: 0.5 });
      capa.addTo(mapa);
      if (celdas.length > 0) {
        mapa.fitBounds(L.latLngBounds(celdas.map((c) => [c.lat, c.lng] as [number, number])).pad(0.4), { maxZoom: 14 });
      }
      quitar = () => mapa.remove();
    })();
    return () => { cancelado = true; quitar?.(); };
  }, [celdas]);

  return <div ref={contenedor} className="mapa-calor" role="img" aria-label={resumen} />;
}
