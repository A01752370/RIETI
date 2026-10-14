import { RespuestaNominatim } from './geo-utilidades';

/**
 * Fuente externa de datos geográficos. Detrás de esta interfaz para que las
 * pruebas la sustituyan por un doble y nunca salgan a internet.
 */
export interface FuenteGeo {
  /** Geocodificación inversa (coordenadas ya redondeadas). */
  reversa(lat: number, lng: number): Promise<RespuestaNominatim>;
  /** Tesela PNG z/x/y. */
  tesela(z: number, x: number, y: number): Promise<Buffer>;
}

/** Token de inyección de la fuente geográfica. */
export const FUENTE_GEO = Symbol('FUENTE_GEO');

/** Tiempo máximo de espera de una llamada externa. */
const TIEMPO_MAXIMO_MS = 6000;

/**
 * Fuente basada en OpenStreetMap: Nominatim para la geocodificación inversa y
 * el servidor de teselas estándar.
 *
 * Cumple las políticas de uso de OSM: `User-Agent` identificable con contacto,
 * máximo 1 petición por segundo a Nominatim (lo controla `GeoService`), caché
 * de resultados y sin autocompletado por tecla. **Apto para demostración, no
 * para tráfico de producción**: para producción conviene un proveedor con
 * contrato y llave (ver docs/arquitectura/aws.md).
 */
export class FuenteOsm implements FuenteGeo {
  private readonly agente = `RIETI/1.0 (SIPINNA Atizapán de Zaragoza; +${process.env.NOMINATIM_CONTACTO ?? 'https://github.com/A01752370/RIETI'})`;

  async reversa(lat: number, lng: number): Promise<RespuestaNominatim> {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.search = new URLSearchParams({
      format: 'jsonv2', lat: String(lat), lon: String(lng), zoom: '18', addressdetails: '1', 'accept-language': 'es',
    }).toString();
    const r = await fetch(url, { headers: { 'User-Agent': this.agente }, signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS) });
    if (!r.ok) throw new Error(`Nominatim respondió ${r.status}`);
    return (await r.json()) as RespuestaNominatim;
  }

  async tesela(z: number, x: number, y: number): Promise<Buffer> {
    const r = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
      headers: { 'User-Agent': this.agente }, signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    if (!r.ok) throw new Error(`Servidor de teselas respondió ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
}
