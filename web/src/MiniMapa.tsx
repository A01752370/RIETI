import { useEffect, useRef } from 'react';

/** Mismo rectángulo que el servidor: fuera de él no hay teselas. */
const LIMITES: [[number, number], [number, number]] = [[18.3, -100.65], [20.35, -98.55]];

/**
 * Mini mapa del detalle del personal (Fase 5) con el punto del lugar de los
 * hechos. Como el mapa de calor, Leaflet se carga **bajo demanda** solo para el
 * personal, y las teselas salen de nuestro API (la CSP no cambia). El punto se
 * dibuja como círculo vectorial (sin imágenes de marcador externas).
 *
 * @param lat latitud del lugar de los hechos
 * @param lng longitud del lugar de los hechos
 */
export default function MiniMapa({ lat, lng }: { lat: number; lng: number }) {
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    let quitar: (() => void) | undefined;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelado || !contenedor.current) return;
      const mapa = L.map(contenedor.current, {
        minZoom: 8, maxZoom: 18, maxBounds: LIMITES, maxBoundsViscosity: 1, attributionControl: false, scrollWheelZoom: false,
      }).setView([lat, lng], 16);
      L.control.attribution({ prefix: false }).addAttribution('© colaboradores de OpenStreetMap').addTo(mapa);
      L.tileLayer('/api/v1/geo/teselas/{z}/{x}/{y}.png', { minZoom: 8, maxZoom: 18, bounds: LIMITES }).addTo(mapa);
      L.circleMarker([lat, lng], { radius: 9, color: '#ffffff', weight: 3, fillColor: '#bb3970', fillOpacity: 1 }).addTo(mapa);
      quitar = () => mapa.remove();
    })();
    return () => { cancelado = true; quitar?.(); };
  }, [lat, lng]);

  return <div ref={contenedor} className="mini-mapa" role="img" aria-label="Mapa con el punto del lugar de los hechos" />;
}
