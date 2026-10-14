/**
 * Utilidades puras del módulo de geografía (sin red ni base de datos), para probarlas.
 */

/** Caja que contiene al Estado de México con margen (lon/lat). Fuera de ella no se geocodifica ni se sirven teselas. */
export const CAJA_EDOMEX = { oeste: -100.65, sur: 18.3, este: -98.55, norte: 20.35 } as const;

/** Zoom permitido para teselas: de vista regional a nivel de calle. */
export const ZOOM_MIN = 8;
export const ZOOM_MAX = 18;

/** ¿El punto está dentro de la caja del Estado de México? */
export function enCajaEdomex(lat: number, lng: number): boolean {
  return lat >= CAJA_EDOMEX.sur && lat <= CAJA_EDOMEX.norte && lng >= CAJA_EDOMEX.oeste && lng <= CAJA_EDOMEX.este;
}

/** Columna (x) de la tesela que contiene la longitud, en el esquema XYZ de OSM. */
export function lonATeselaX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

/** Fila (y) de la tesela que contiene la latitud (proyección Web Mercator). */
export function latATeselaY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

/**
 * ¿La tesela z/x/y se puede servir? Debe tener zoom permitido y tocar la caja del
 * Estado de México. Así el proxy no sirve para descargar el mapa de todo el mundo.
 */
export function teselaPermitida(z: number, x: number, y: number): boolean {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (z < ZOOM_MIN || z > ZOOM_MAX) return false;
  const xMin = lonATeselaX(CAJA_EDOMEX.oeste, z);
  const xMax = lonATeselaX(CAJA_EDOMEX.este, z);
  const yMin = latATeselaY(CAJA_EDOMEX.norte, z); // el norte tiene la y menor
  const yMax = latATeselaY(CAJA_EDOMEX.sur, z);
  return x >= xMin && x <= xMax && y >= yMin && y <= yMax;
}

/**
 * Redondea a 4 decimales (≈ 11 m) antes de consultar al geocodificador externo:
 * suficiente para la dirección y comparte menos precisión con el tercero.
 * También es la llave de la caché.
 */
export function redondearParaGeocodificar(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

/** Dirección sugerida por la geocodificación inversa (todos los campos editables en la app). */
export interface DireccionSugerida {
  calle: string | null;
  numeroExterior: string | null;
  colonia: string | null;
  codigoPostal: string | null;
}

/** Respuesta de Nominatim (`/reverse?format=jsonv2&addressdetails=1`), solo lo que se usa. */
export interface RespuestaNominatim {
  address?: Record<string, string | undefined>;
}

/**
 * Traduce la respuesta de Nominatim a la dirección del formulario. Nominatim usa
 * distintas llaves según el lugar; se toma la primera disponible en cada campo.
 * El código postal solo se acepta si tiene 5 dígitos.
 */
export function direccionDesdeNominatim(r: RespuestaNominatim): DireccionSugerida {
  const a = r.address ?? {};
  const primero = (...llaves: string[]) => llaves.map((k) => a[k]?.trim()).find((v) => v) ?? null;
  const cp = primero('postcode');
  return {
    calle: primero('road', 'pedestrian', 'footway', 'path', 'residential'),
    numeroExterior: primero('house_number'),
    colonia: primero('neighbourhood', 'suburb', 'quarter', 'city_district', 'hamlet', 'village'),
    codigoPostal: cp && /^\d{5}$/.test(cp) ? cp : null,
  };
}

/**
 * Caché LRU sencilla con caducidad (en memoria de cada tarea).
 * Se reinicia al desplegar; está bien porque solo ahorra llamadas externas.
 */
export class CacheLru<V> {
  private readonly datos = new Map<string, { valor: V; expira: number }>();

  constructor(private readonly maximo: number, private readonly ttlMs: number, private readonly ahora: () => number = Date.now) {}

  obtener(llave: string): V | undefined {
    const e = this.datos.get(llave);
    if (!e) return undefined;
    if (e.expira <= this.ahora()) {
      this.datos.delete(llave);
      return undefined;
    }
    // Reinsertar la mueve al final (más reciente).
    this.datos.delete(llave);
    this.datos.set(llave, e);
    return e.valor;
  }

  guardar(llave: string, valor: V): void {
    this.datos.delete(llave);
    this.datos.set(llave, { valor, expira: this.ahora() + this.ttlMs });
    while (this.datos.size > this.maximo) this.datos.delete(this.datos.keys().next().value!);
  }

  get tamano(): number {
    return this.datos.size;
  }
}

/**
 * Espaciador de llamadas: garantiza al menos `intervaloMs` entre llamadas
 * consecutivas a un servicio externo (Nominatim exige ≤ 1 por segundo).
 * Si la espera sería mayor que `esperaMaximaMs`, rechaza en vez de encolar sin fin.
 */
export class Espaciador {
  private siguiente = 0;

  constructor(private readonly intervaloMs: number, private readonly esperaMaximaMs: number, private readonly ahora: () => number = Date.now) {}

  /** Milisegundos que hay que esperar antes de llamar, o null si se excede la espera máxima. Reserva el turno. */
  reservar(): number | null {
    const t = this.ahora();
    const turno = Math.max(t, this.siguiente);
    const espera = turno - t;
    if (espera > this.esperaMaximaMs) return null;
    this.siguiente = turno + this.intervaloMs;
    return espera;
  }
}

/**
 * Semáforo con cola acotada: limita las descargas simultáneas hacia el servidor
 * externo (política de uso de OSM) sin rechazar de inmediato las ráfagas normales
 * de un mapa (Leaflet pide 15–20 teselas a la vez). Si la cola está llena o la
 * espera se agota, rechaza.
 */
export class Semaforo {
  private enCurso = 0;
  private readonly cola: Array<() => void> = [];

  constructor(private readonly maximo: number, private readonly colaMaxima: number) {}

  /** Espera un turno. @returns false si la cola está llena o se agotó la espera. */
  async adquirir(esperaMaximaMs: number): Promise<boolean> {
    if (this.enCurso < this.maximo) {
      this.enCurso++;
      return true;
    }
    if (this.cola.length >= this.colaMaxima) return false;
    return new Promise<boolean>((resolver) => {
      const turno = () => { clearTimeout(reloj); this.enCurso++; resolver(true); };
      const reloj = setTimeout(() => {
        const i = this.cola.indexOf(turno);
        if (i >= 0) this.cola.splice(i, 1);
        resolver(false);
      }, esperaMaximaMs);
      this.cola.push(turno);
    });
  }

  /** Libera el turno y despierta al siguiente en la cola. */
  liberar(): void {
    this.enCurso--;
    this.cola.shift()?.();
  }

  get ocupados(): number {
    return this.enCurso;
  }

  get enEspera(): number {
    return this.cola.length;
  }
}
