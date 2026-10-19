import { useEffect, useRef } from 'react';
import type { Territorio } from './api';

/** Mismo rectángulo que el servidor: fuera de él no hay teselas. */
const LIMITES: [[number, number], [number, number]] = [[18.3, -100.65], [20.35, -98.55]];

/** Colores de la escala (de menos a más reportes); los municipios con conteo oculto van en gris. */
const ESCALA = ['#cfe8e4', '#8fcac1', '#4da99d', '#1f7f73', '#0d5048'];
const COLOR_PRIORIDAD: Record<string, string> = { Alta: '#b3261e', Media: '#b26a00', Normal: '#00695c' };

/** Clase de color de un conteo según el máximo (pura, probada). */
export function claseEscala(total: number | null, maximo: number): number {
  if (total === null || maximo <= 0) return -1;
  return Math.min(ESCALA.length - 1, Math.floor((total / maximo) * ESCALA.length - 1e-9));
}

/** Texto de un nodo (nunca HTML: los nombres vienen de datos). */
function etiqueta(texto: string): HTMLElement {
  const el = document.createElement('span');
  el.textContent = texto;
  return el;
}

/**
 * Mapa territorial del panel (Fase 9): región (polígonos municipales simplificados con
 * conteo), colonias (centro aproximado) y puntos (solo personal con alcance; sin texto).
 * Leaflet se carga bajo demanda y las teselas salen de nuestro API (CSP sin cambios).
 *
 * @param datos respuesta de `/estadisticas/territorio`
 * @param alElegirMunicipio al tocar un municipio (baja de nivel)
 * @param alAbrirReporte al tocar un punto (abre el detalle)
 * @param resumen texto alternativo para lectores de pantalla
 */
export default function MapaTerritorial({ datos, alElegirMunicipio, alAbrirReporte, resumen }: {
  datos: Territorio; alElegirMunicipio: (id: number) => void; alAbrirReporte: (id: number) => void; resumen: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    let quitar: (() => void) | undefined;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelado || !contenedor.current) return;
      const mapa = L.map(contenedor.current, {
        minZoom: 8, maxZoom: 18, maxBounds: LIMITES, maxBoundsViscosity: 1, attributionControl: false,
      }).setView([19.55, -99.25], 9);
      L.control.attribution({ prefix: false }).addAttribution('© colaboradores de OpenStreetMap · INEGI').addTo(mapa);
      L.tileLayer('/api/v1/geo/teselas/{z}/{x}/{y}.png', { minZoom: 8, maxZoom: 18, bounds: LIMITES }).addTo(mapa);
      const limites: [number, number][] = [];

      if (datos.nivel === 'region') {
        const maximo = Math.max(0, ...(datos.municipios ?? []).map((m) => m.total ?? 0));
        for (const m of datos.municipios ?? []) {
          const clase = claseEscala(m.total, maximo);
          const capa = L.geoJSON(m.geometria as GeoJSON.GeoJsonObject, {
            style: { color: '#ffffff', weight: 1.5, fillColor: clase < 0 ? '#bdbdbd' : ESCALA[clase], fillOpacity: 0.7 },
          });
          capa.bindTooltip(etiqueta(`${m.nombre}: ${m.total === null ? `menos de ${datos.umbral}` : m.total} reporte(s)`), { sticky: true });
          capa.on('click', () => alElegirMunicipio(m.id));
          capa.addTo(mapa);
          const b = capa.getBounds();
          if (b.isValid()) limites.push([b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]);
        }
      } else if (datos.nivel === 'colonia') {
        const maximo = Math.max(1, ...(datos.colonias ?? []).map((c) => c.total ?? 0));
        for (const c of datos.colonias ?? []) {
          if (c.lat === null || c.lng === null || c.total === null) continue;
          L.circleMarker([c.lat, c.lng], { radius: 8 + 16 * (c.total / maximo), color: '#ffffff', weight: 2, fillColor: '#1f7f73', fillOpacity: 0.75 })
            .bindTooltip(etiqueta(`${c.colonia}: ${c.total} reporte(s)`)).addTo(mapa);
          limites.push([c.lat, c.lng]);
        }
      } else {
        for (const p of datos.puntos ?? []) {
          L.circleMarker([p.lat, p.lng], { radius: 7, color: '#ffffff', weight: 2, fillColor: COLOR_PRIORIDAD[p.prioridad ?? ''] ?? '#455a64', fillOpacity: 0.9 })
            .bindTooltip(etiqueta(`Prioridad ${p.prioridad ?? 'sin dato'} · ${p.estatus}. Toca para abrir el reporte.`))
            .on('click', () => alAbrirReporte(p.id)).addTo(mapa);
          limites.push([p.lat, p.lng]);
        }
      }
      if (limites.length > 0) mapa.fitBounds(L.latLngBounds(limites).pad(0.15), { maxZoom: 16 });
      quitar = () => mapa.remove();
    })();
    return () => { cancelado = true; quitar?.(); };
  }, [datos]);

  return <div ref={contenedor} className="mapa-calor" role="img" aria-label={resumen} />;
}
