import { BadRequestException, Controller, Get, Header, Query, Req } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DataSource } from 'typeorm';
import { Alcance, alcanceDe, registrarAcceso } from '../auth/alcance';
import { RequestAutenticado } from '../auth/jwt.guard';
import { Requiere } from '../auth/roles';
import { celdaCsv, umbralMinimo } from './agregados';
import { DESDE_FILTRADO, FiltrosEstadisticasDto, parametros, SQL_FRANJA } from './estadisticas.controller';
import { DECIMALES_BASE_REGIONAL, HallazgoDto, hallazgosPorZona, masFrecuente, normalizarColonia, redondear } from './territorio';

/** Filtros + nivel del mapa territorial (Fase 9). */
export class TerritorioDto extends FiltrosEstadisticasDto {
  /** `region` (municipios con polígonos), `colonia` o `punto` (estos dos requieren municipio). */
  @IsIn(['region', 'colonia', 'punto'])
  nivel: 'region' | 'colonia' | 'punto';
}

/** Filtros + periodo de los hallazgos. */
export class HallazgosDto extends FiltrosEstadisticasDto {
  /** Meses hacia atrás (por omisión 3). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  meses = 3;
}

/** Municipio del nivel región: polígono simplificado y conteo protegido. */
export interface MunicipioTerritorioDto {
  id: number;
  clave: string | null;
  nombre: string;
  /** null si es menor que el umbral. */
  total: number | null;
  /** Polígono simplificado (GeoJSON). */
  geometria: unknown;
}

/** Colonia del nivel colonia (agrupada por el texto capturado, normalizado). */
export interface ColoniaTerritorioDto {
  colonia: string;
  total: number | null;
  /** Centro aproximado (3 decimales) de los reportes con punto, si hay suficientes. */
  lat: number | null;
  lng: number | null;
}

/** Punto del nivel punto (solo personal con alcance; sin texto). */
export interface PuntoTerritorioDto {
  id: number;
  lat: number;
  lng: number;
  prioridad: string | null;
  estatus: string;
}

/** Respuesta de `GET /api/v1/estadisticas/territorio`. */
export interface TerritorioRespuestaDto {
  nivel: string;
  umbral: number;
  municipios?: MunicipioTerritorioDto[];
  colonias?: ColoniaTerritorioDto[];
  sinColonia?: number | null;
  puntos?: PuntoTerritorioDto[];
  /** Reportes filtrados sin punto en el mapa (nivel punto). */
  sinUbicacion?: number;
}

/** Máximo de puntos por consulta (nivel punto). */
const MAX_PUNTOS = 1000;

/**
 * Mapa territorial e inteligencia (Fase 9). Todas las consultas usan los filtros comunes del
 * panel y el alcance por municipio. Región y colonia son conteos con umbral; el nivel punto
 * es solo para el personal con alcance sobre el municipio y no lleva texto.
 */
@Controller('estadisticas')
export class TerritorioController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private alcance(req: RequestAutenticado): Promise<Alcance> {
    return alcanceDe(this.ds, req.usuario!);
  }

  @Requiere('estadisticas.ver')
  @Get('territorio')
  async territorio(@Query() f: TerritorioDto, @Req() req: RequestAutenticado): Promise<TerritorioRespuestaDto> {
    const alcance = await this.alcance(req);
    const params = parametros(f, alcance);
    const umbral = umbralMinimo();

    if (f.nivel === 'region') {
      const filas: { id: number; clave: string | null; nombre: string; total: number; geometria: string }[] = await this.ds.query(
        `WITH conteo AS (SELECT r.id_municipio, count(*)::int AS total ${DESDE_FILTRADO} GROUP BY r.id_municipio)
         SELECT m.id_municipio AS id, m.clave_inegi AS clave, m.nombre, coalesce(c.total, 0) AS total,
                ST_AsGeoJSON(ST_SimplifyPreserveTopology(g.geom, 0.002), 4) AS geometria
         FROM municipio m JOIN municipio_geom g ON g.id_municipio = m.id_municipio
         LEFT JOIN conteo c ON c.id_municipio = m.id_municipio
         WHERE c.total > 0 OR ($8::int[] IS NOT NULL AND m.id_municipio = ANY($8::int[]))
         ORDER BY m.nombre`, params);
      return {
        nivel: 'region', umbral,
        municipios: filas.map((x) => ({
          id: Number(x.id), clave: x.clave, nombre: x.nombre, total: x.total >= umbral ? x.total : null, geometria: JSON.parse(x.geometria),
        })),
      };
    }

    if (!f.municipioId) throw new BadRequestException({ codigo: 'VALOR_NO_VALIDO', mensaje: 'Elige un municipio para ver colonias o puntos' });

    if (f.nivel === 'colonia') {
      const filas: { colonia: string | null; lat: string | null; lng: string | null }[] = await this.ds.query(
        `SELECT u.colonia, u.latitud AS lat, u.longitud AS lng
         ${DESDE_FILTRADO.replace('WHERE', 'JOIN ubicacion u ON u.id_ubicacion = r.id_ubicacion WHERE')}`, params);
      const grupos = new Map<string, { nombres: string[]; puntos: { lat: number; lng: number }[]; total: number }>();
      let sinColonia = 0;
      for (const x of filas) {
        const clave = normalizarColonia(x.colonia);
        if (!clave) { sinColonia++; continue; }
        const g = grupos.get(clave) ?? { nombres: [], puntos: [], total: 0 };
        g.total++;
        g.nombres.push(x.colonia!.trim());
        if (x.lat !== null && x.lng !== null) g.puntos.push({ lat: Number(x.lat), lng: Number(x.lng) });
        grupos.set(clave, g);
      }
      const colonias = [...grupos.values()].sort((a, b) => b.total - a.total).map((g) => {
        const visible = g.total >= umbral;
        const centro = visible && g.puntos.length >= umbral
          ? { lat: redondear(g.puntos.reduce((s, p) => s + p.lat, 0) / g.puntos.length, 3), lng: redondear(g.puntos.reduce((s, p) => s + p.lng, 0) / g.puntos.length, 3) }
          : { lat: null, lng: null };
        return { colonia: masFrecuente(g.nombres)!.valor, total: visible ? g.total : null, ...centro };
      });
      return { nivel: 'colonia', umbral, colonias, sinColonia: sinColonia >= umbral || sinColonia === 0 ? sinColonia : null };
    }

    const puntos: { id: number; lat: string | null; lng: string | null; prioridad: string | null; estatus: string }[] = await this.ds.query(
      `SELECT r.id_reporte AS id, round(u.latitud, 4) AS lat, round(u.longitud, 4) AS lng, r.prioridad, e.nombre AS estatus
       ${DESDE_FILTRADO.replace('WHERE', 'JOIN ubicacion u ON u.id_ubicacion = r.id_ubicacion WHERE')}
       ORDER BY r.fecha_creacion DESC LIMIT ${MAX_PUNTOS + 1}`, params);
    const conPunto = puntos.filter((p) => p.lat !== null && p.lng !== null);
    return {
      nivel: 'punto', umbral, sinUbicacion: puntos.length - conPunto.length,
      puntos: conPunto.slice(0, MAX_PUNTOS).map((p) => ({ id: Number(p.id), lat: Number(p.lat), lng: Number(p.lng), prioridad: p.prioridad, estatus: p.estatus })),
    };
  }

  /**
   * Hallazgos automáticos redactados con los datos reales del periodo (por omisión 3 meses):
   * zonas con varios reportes y su patrón de días y horas, solo si hay datos suficientes.
   */
  @Requiere('estadisticas.ver')
  @Get('hallazgos')
  async hallazgos(@Query() f: HallazgosDto, @Req() req: RequestAutenticado): Promise<{ meses: number; minimo: number; hallazgos: HallazgoDto[] }> {
    const alcance = await this.alcance(req);
    const filas: { lat: string; lng: string; dia: number; hora: number; colonia: string | null; municipio: string | null }[] = await this.ds.query(
      `SELECT u.latitud AS lat, u.longitud AS lng,
              extract(dow FROM r.fecha_creacion AT TIME ZONE $4)::int AS dia,
              extract(hour FROM r.fecha_creacion AT TIME ZONE $4)::int AS hora,
              u.colonia, m.nombre AS municipio
       ${DESDE_FILTRADO.replace('WHERE', `JOIN ubicacion u ON u.id_ubicacion = r.id_ubicacion
         LEFT JOIN municipio m ON m.id_municipio = r.id_municipio WHERE`)}
         AND u.latitud IS NOT NULL AND r.duplicado_de IS NULL
         AND r.fecha_creacion >= now() - make_interval(months => $16::int)`, [...parametros(f, alcance), f.meses]);
    const minimo = Math.max(5, umbralMinimo());
    const hallazgos = hallazgosPorZona(filas.map((x) => ({
      lat: Number(x.lat), lng: Number(x.lng), dia: x.dia, hora: x.hora, colonia: x.colonia?.trim() || null, municipio: x.municipio,
    })), f.meses, minimo);
    return { meses: f.meses, minimo, hallazgos };
  }

  /**
   * Base regional anonimizada (CSV) para la coordinación regional: una fila por celda de
   * ≈ 110 m, municipio y trimestre, solo con conteos. Sin texto libre, sin direcciones, sin
   * fotos ni folios; las celdas con menos reportes que el umbral se omiten.
   */
  @Requiere('base.exportar')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('base-regional.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="base-regional-rieti.csv"')
  @Header('Cache-Control', 'no-store')
  async baseRegional(@Query() f: FiltrosEstadisticasDto, @Req() req: RequestAutenticado): Promise<string> {
    const alcance = await this.alcance(req);
    const umbral = umbralMinimo();
    const d = DECIMALES_BASE_REGIONAL;
    const filas: Record<string, string | number | null>[] = await this.ds.query(
      `WITH base AS (
         SELECT m.clave_inegi, m.nombre AS municipio, round(u.latitud, ${d}) AS celda_lat, round(u.longitud, ${d}) AS celda_lng,
                to_char(r.fecha_creacion AT TIME ZONE $4, 'YYYY-"T"Q') AS trimestre,
                r.prioridad, c.verificacion, coalesce(c.nna_canalizados, 0) AS canalizados, a.nombre AS actividad, ${SQL_FRANJA} AS franja
         ${DESDE_FILTRADO.replace('WHERE', `JOIN ubicacion u ON u.id_ubicacion = r.id_ubicacion
           JOIN municipio m ON m.id_municipio = r.id_municipio WHERE`)}
           AND u.latitud IS NOT NULL AND r.duplicado_de IS NULL)
       SELECT clave_inegi, municipio, celda_lat, celda_lng, trimestre, count(*)::int AS reportes,
              count(*) FILTER (WHERE prioridad = 'Alta')::int AS prioridad_alta,
              count(*) FILTER (WHERE verificacion IN ('Verificado', 'Caso confirmado'))::int AS verificados,
              count(*) FILTER (WHERE verificacion = 'Caso confirmado')::int AS casos_confirmados,
              sum(canalizados)::int AS nna_canalizados,
              mode() WITHIN GROUP (ORDER BY actividad) AS actividad_frecuente,
              mode() WITHIN GROUP (ORDER BY franja) AS franja_frecuente
       FROM base GROUP BY clave_inegi, municipio, celda_lat, celda_lng, trimestre
       HAVING count(*) >= $16
       ORDER BY trimestre, clave_inegi, celda_lat, celda_lng`, [...parametros(f, alcance), umbral]);
    const columnas = ['clave_inegi', 'municipio', 'celda_lat', 'celda_lng', 'trimestre', 'reportes', 'prioridad_alta', 'verificados',
      'casos_confirmados', 'nna_canalizados', 'actividad_frecuente', 'franja_frecuente'];
    await registrarAcceso(this.ds, alcance.idUsuario, 'exportar', null, `base regional: ${filas.length} celda(s)`);
    return [columnas.join(','), ...filas.map((x) => columnas.map((c) => celdaCsv(x[c] as string | number | null)).join(','))].join('\r\n') + '\r\n';
  }
}
