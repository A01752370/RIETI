import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FUENTE_GEO, FuenteGeo } from './fuente-geo';
import {
  CacheLru, DireccionSugerida, direccionDesdeNominatim, enCajaEdomex, Espaciador, redondearParaGeocodificar, teselaPermitida,
} from './geo-utilidades';

/** Municipio del catálogo en el que cae un punto. */
export interface MunicipioSugeridoDto {
  id: number;
  nombre: string;
}

/** Respuesta de `GET /api/v1/geo/reversa`. */
export interface GeoReversaDto {
  /** Dirección sugerida; campos null si no se encontró o el servicio externo no respondió. */
  direccion: DireccionSugerida;
  /** Municipio donde cae el punto según los polígonos del INEGI (no depende del servicio externo). */
  municipioSugerido: MunicipioSugeridoDto | null;
  /** false si el servicio externo de direcciones no respondió (el municipio sí se calcula). */
  direccionDisponible: boolean;
  /** Atribución que la app debe mostrar. */
  atribucion: string;
}

const ATRIBUCION = '© colaboradores de OpenStreetMap';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Geocodificación inversa y teselas **mediadas por el backend**: la app nunca
 * llama directo a terceros, así que el proveedor no ve la IP ni el dispositivo
 * de quien reporta. Coordenadas redondeadas a ≈ 11 m antes de salir, caché en
 * memoria y máximo 1 petición por segundo hacia Nominatim (por tarea).
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly cacheDirecciones = new CacheLru<DireccionSugerida>(5000, 7 * 24 * 3600_000);
  private readonly cacheTeselas = new CacheLru<Buffer>(2000, 24 * 3600_000);
  private readonly espaciador = new Espaciador(1000, 3000);
  private teselasEnCurso = 0;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(FUENTE_GEO) private readonly fuente: FuenteGeo,
  ) {}

  /**
   * Dirección sugerida y municipio donde cae el punto.
   *
   * @throws BadRequestException `FUERA_DE_COBERTURA` si el punto está fuera del Estado de México
   * @throws HttpException 503 `GEOCODIFICACION_OCUPADA` si hay demasiadas consultas en cola
   */
  async reversa(lat: number, lng: number): Promise<GeoReversaDto> {
    if (!enCajaEdomex(lat, lng)) {
      throw new BadRequestException({ codigo: 'FUERA_DE_COBERTURA', mensaje: 'El punto está fuera del Estado de México' });
    }
    const latR = redondearParaGeocodificar(lat);
    const lngR = redondearParaGeocodificar(lng);
    const municipioSugerido = await this.municipioEn(lat, lng);

    const llave = `${latR},${lngR}`;
    let direccion = this.cacheDirecciones.obtener(llave);
    let direccionDisponible = true;
    if (!direccion) {
      const espera = this.espaciador.reservar();
      if (espera === null) {
        throw new HttpException(
          { codigo: 'GEOCODIFICACION_OCUPADA', mensaje: 'Hay muchas consultas de dirección en este momento. Escribe la dirección o inténtalo en unos segundos' },
          HttpStatus.SERVICE_UNAVAILABLE);
      }
      if (espera > 0) await sleep(espera);
      try {
        direccion = direccionDesdeNominatim(await this.fuente.reversa(latR, lngR));
        this.cacheDirecciones.guardar(llave, direccion);
      } catch (e) {
        // Sin coordenadas en el log (RNF-29): solo el tipo de falla.
        this.logger.warn(`Geocodificación externa no disponible: ${(e as Error).message}`);
        direccion = { calle: null, numeroExterior: null, colonia: null, codigoPostal: null };
        direccionDisponible = false;
      }
    }
    return { direccion, municipioSugerido, direccionDisponible, atribucion: ATRIBUCION };
  }

  /**
   * Municipio que contiene el punto; si cae justo fuera de un límite, el más
   * cercano a menos de 300 m. Usa los polígonos del INEGI en PostGIS.
   */
  async municipioEn(lat: number, lng: number): Promise<MunicipioSugeridoDto | null> {
    const filas: { id: number; nombre: string }[] = await this.ds.query(
      `SELECT m.id_municipio AS id, m.nombre
       FROM municipio_geom g JOIN municipio m ON m.id_municipio = g.id_municipio
       WHERE ST_DWithin(g.geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, 300)
       ORDER BY ST_Distance(g.geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography)
       LIMIT 1`,
      [lat, lng]);
    return filas[0] ? { id: Number(filas[0].id), nombre: filas[0].nombre } : null;
  }

  /**
   * Tesela PNG del Estado de México (zoom 8–18), con caché.
   *
   * @throws NotFoundException `TESELA_FUERA_DE_COBERTURA`
   * @throws HttpException 503 `TESELA_NO_DISPONIBLE` si el servidor externo falla o hay demasiadas en curso
   */
  async tesela(z: number, x: number, y: number): Promise<Buffer> {
    if (!teselaPermitida(z, x, y)) {
      throw new NotFoundException({ codigo: 'TESELA_FUERA_DE_COBERTURA', mensaje: 'El mapa solo cubre el Estado de México' });
    }
    const llave = `${z}/${x}/${y}`;
    const guardada = this.cacheTeselas.obtener(llave);
    if (guardada) return guardada;
    // Pocas descargas simultáneas hacia el servidor externo (política de uso de OSM).
    if (this.teselasEnCurso >= 4) throw this.teselaNoDisponible();
    this.teselasEnCurso++;
    try {
      const png = await this.fuente.tesela(z, x, y);
      this.cacheTeselas.guardar(llave, png);
      return png;
    } catch (e) {
      this.logger.warn(`Tesela externa no disponible: ${(e as Error).message}`);
      throw this.teselaNoDisponible();
    } finally {
      this.teselasEnCurso--;
    }
  }

  private teselaNoDisponible(): HttpException {
    return new HttpException({ codigo: 'TESELA_NO_DISPONIBLE', mensaje: 'El mapa no está disponible por ahora' }, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
