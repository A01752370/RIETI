import { Controller, Get, Query } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { DataSource } from 'typeorm';
import { Requiere } from '../auth/roles';
import { ESTATUS, ESTATUS_ORDENADOS } from '../reportes/estatus';
import {
  celdasDeCalor, CeldaCalorDto, ConteoProtegidoDto, minimoCasosTiempo, proteger, TAMANO_CELDA_GRADOS, tiempoHastaHito, TiempoHitoDto,
  tiemposPorEstatus, TiempoEstatusDto, umbralMinimo,
} from './agregados';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Filtros del panel: fechas (inclusive), municipio, estatus vigente y actividad. */
export class FiltrosEstadisticasDto {
  /** Fecha inicial `AAAA-MM-DD` (hora de la Ciudad de México). */
  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener el formato AAAA-MM-DD' })
  desde?: string;

  /** Fecha final `AAAA-MM-DD`, incluida. */
  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener el formato AAAA-MM-DD' })
  hasta?: string;

  /** `id` del municipio. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  municipioId?: number;

  /** Estatus vigente del caso. */
  @IsOptional()
  @IsIn(ESTATUS_ORDENADOS)
  estatus?: string;

  /** Actividad (nombre del catálogo). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  actividad?: string;
}

/** Filtros + antigüedad para "sin atender". */
export class SinAtenderDto extends FiltrosEstadisticasDto {
  /** Días sin cambios para considerar un caso sin atender (por defecto 7). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  dias = 7;
}

/** Conteo por categoría. */
export interface ConteoDto {
  etiqueta: string;
  total: number;
}

/**
 * Respuesta de `GET /api/v1/estadisticas/resumen`. **Solo conteos agregados**:
 * nunca incluye folios, descripciones, ubicaciones ni datos de personas.
 */
export interface ResumenEstadisticasDto {
  total: number;
  /** Reportes creados en los últimos 7 días (dentro de los filtros). */
  nuevosUltimos7Dias: number;
  /** Reportes sin municipio indicado (creados antes de D-16 o desde la app anterior). */
  sinMunicipio: number;
  /** Casos que esperan atención: Recibido o En revisión. */
  pendientes: number;
  /** Pendientes en los que quien reportó percibió riesgo ("Sí"; Fase 5). */
  riesgoAltoPendientes: number;
  /** Los 6 estatus canónicos en el orden del proceso, incluso con 0. */
  porEstatus: ConteoDto[];
  /** Por mes `AAAA-MM`, del más antiguo al más reciente. */
  porMes: ConteoDto[];
}

/** Respuesta de `GET /api/v1/estadisticas/distribuciones`. */
export interface DistribucionesDto {
  /** Conteos menores que este umbral se devuelven como `null`. */
  umbral: number;
  porMunicipio: ConteoProtegidoDto[];
  porActividad: ConteoProtegidoDto[];
  /** Menores observados por grupo de edad (suma de los grupos de los reportes). */
  porGrupoEdad: ConteoProtegidoDto[];
}

/** Respuesta de `GET /api/v1/estadisticas/tiempos`. */
export interface TiemposDto {
  umbral: number;
  /** Tiempo promedio que los casos permanecen en cada estatus antes de cambiar. */
  porEstatus: TiempoEstatusDto[];
  /** Del alta al primer cambio de estatus (la primera revisión del personal; Fase 5). */
  hastaPrimeraRevision: TiempoHitoDto;
  /** Del alta a la primera vez que el caso llegó a "Concluido" (Fase 5). */
  hastaConclusion: TiempoHitoDto;
}

/** Respuesta de `GET /api/v1/estadisticas/sin-atender`. */
export interface SinAtenderRespuestaDto {
  dias: number;
  /** Casos en Recibido o En revisión sin cambios en más de `dias` días. */
  total: number;
  umbral: number;
  porMunicipio: ConteoProtegidoDto[];
}

/** Respuesta de `GET /api/v1/estadisticas/mapa-calor`. */
export interface MapaCalorDto {
  umbral: number;
  /** Tamaño de la celda en grados (≈ 550 m). */
  tamanoCelda: number;
  /** Centros de celda con al menos `umbral` reportes; nunca coordenadas de reportes. */
  celdas: CeldaCalorDto[];
  /** Celdas con reportes pero por debajo del umbral (no se muestran). */
  ocultas: number;
  /** Reportes filtrados que no tienen punto en el mapa. */
  sinUbicacion: number;
}

/** Zona horaria de referencia para agrupar por día y mes. */
const ZONA = 'America/Mexico_City';

/** Estatus que cuentan como "pendientes de atender". */
const PENDIENTES = ['Recibido', 'En revisión'];

/**
 * Cláusula FROM/WHERE común a todas las estadísticas (consultas parametrizadas:
 * $1 desde, $2 hasta, $3 municipio, $4 zona, $5 estatus, $6 actividad).
 */
const DESDE_FILTRADO = `
  FROM reporte r
  JOIN reporte_caso rc ON rc.id_reporte = r.id_reporte
  JOIN caso c ON c.id_caso = rc.id_caso
  JOIN estatus_reporte e ON e.id_estatus = c.id_estatus
  JOIN actividad a ON a.id_actividad = r.id_actividad
  WHERE ($1::date IS NULL OR (r.fecha_creacion AT TIME ZONE $4)::date >= $1::date)
    AND ($2::date IS NULL OR (r.fecha_creacion AT TIME ZONE $4)::date <= $2::date)
    AND ($3::int IS NULL OR r.id_municipio = $3::int)
    AND ($5::text IS NULL OR e.nombre = $5::text)
    AND ($6::text IS NULL OR a.nombre = $6::text)`;

const parametros = (f: FiltrosEstadisticasDto) =>
  [f.desde ?? null, f.hasta ?? null, f.municipioId ?? null, ZONA, f.estatus ?? null, f.actividad ?? null];

/**
 * Panel de estadísticas del personal (`estadisticas.ver`). Solo datos agregados,
 * sin PII; las celdas pequeñas se ocultan con un umbral (ver {@link umbralMinimo}).
 */
@Controller('estadisticas')
export class EstadisticasController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Tarjetas, conteo por estatus y serie mensual con los filtros indicados. */
  @Requiere('estadisticas.ver')
  @Get('resumen')
  async resumen(@Query() f: FiltrosEstadisticasDto): Promise<ResumenEstadisticasDto> {
    const params = parametros(f);
    const [[tarjetas], estatus, meses] = await Promise.all([
      this.ds.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE r.fecha_creacion >= now() - interval '7 days')::int AS nuevos,
                count(*) FILTER (WHERE r.id_municipio IS NULL)::int AS sin_municipio,
                count(*) FILTER (WHERE e.nombre = ANY($7::text[]))::int AS pendientes,
                count(*) FILTER (WHERE e.nombre = ANY($7::text[]) AND ri.nombre = 'Sí')::int AS riesgo_alto
         ${DESDE_FILTRADO.replace('WHERE', 'JOIN riesgo ri ON ri.id_riesgo = r.id_riesgo WHERE')}`, [...params, PENDIENTES]),
      this.ds.query(`SELECT e.nombre AS etiqueta, count(*)::int AS total ${DESDE_FILTRADO} GROUP BY e.nombre`, params),
      this.ds.query(
        `SELECT to_char(date_trunc('month', r.fecha_creacion AT TIME ZONE $4), 'YYYY-MM') AS etiqueta, count(*)::int AS total
         ${DESDE_FILTRADO} GROUP BY 1 ORDER BY 1`, params),
    ]) as [[{ total: number; nuevos: number; sin_municipio: number; pendientes: number; riesgo_alto: number }], ConteoDto[], ConteoDto[]];

    const porNombre = new Map(estatus.map((e) => [e.etiqueta, e.total]));
    return {
      total: tarjetas.total,
      nuevosUltimos7Dias: tarjetas.nuevos,
      sinMunicipio: tarjetas.sin_municipio,
      pendientes: tarjetas.pendientes,
      riesgoAltoPendientes: tarjetas.riesgo_alto,
      porEstatus: ESTATUS_ORDENADOS.map((e) => ({ etiqueta: e, total: porNombre.get(e) ?? 0 })),
      porMes: meses,
    };
  }

  /** Distribución por municipio, actividad y grupo de edad (celdas pequeñas ocultas). */
  @Requiere('estadisticas.ver')
  @Get('distribuciones')
  async distribuciones(@Query() f: FiltrosEstadisticasDto): Promise<DistribucionesDto> {
    const params = parametros(f);
    const umbral = umbralMinimo();
    const [municipios, actividades, edades] = await Promise.all([
      this.ds.query(
        `SELECT coalesce(m.nombre, 'Sin municipio') AS etiqueta, count(*)::int AS total
         ${DESDE_FILTRADO.replace('WHERE', 'LEFT JOIN municipio m ON m.id_municipio = r.id_municipio WHERE')}
         GROUP BY 1 ORDER BY 2 DESC, 1`, params),
      this.ds.query(`SELECT a.nombre AS etiqueta, count(*)::int AS total ${DESDE_FILTRADO} GROUP BY a.nombre, a.orden ORDER BY a.orden`, params),
      this.ds.query(
        `SELECT re.nombre AS etiqueta, sum(g.cantidad)::int AS total
         ${DESDE_FILTRADO.replace('WHERE', `JOIN reporte_menores_grupo g ON g.id_reporte = r.id_reporte
           JOIN rango_edad re ON re.id_rango_edad = g.id_rango_edad WHERE`)}
         GROUP BY re.nombre, re.id_rango_edad ORDER BY re.id_rango_edad`, params),
    ]) as [ConteoDto[], ConteoDto[], ConteoDto[]];
    return {
      umbral,
      porMunicipio: proteger(municipios, umbral),
      porActividad: proteger(actividades, umbral),
      porGrupoEdad: proteger(edades, umbral),
    };
  }

  /** Tiempo promedio en cada estatus, calculado con la bitácora. */
  @Requiere('estadisticas.ver')
  @Get('tiempos')
  async tiempos(@Query() f: FiltrosEstadisticasDto): Promise<TiemposDto> {
    const umbral = umbralMinimo();
    const filas: { id_caso: number; estatus: string; fecha: Date }[] = await this.ds.query(
      `SELECT s.id_caso, es.nombre AS estatus, s.fecha
       FROM seguimiento s JOIN estatus_reporte es ON es.id_estatus = s.id_estatus
       WHERE s.id_caso IN (SELECT c.id_caso ${DESDE_FILTRADO})
       ORDER BY s.id_caso, s.fecha, s.id_seguimiento`, parametros(f));
    const eventos = filas.map((x) => ({ idCaso: Number(x.id_caso), estatus: x.estatus, fecha: new Date(x.fecha) }));
    const minimo = minimoCasosTiempo(umbral);
    return {
      umbral,
      porEstatus: tiemposPorEstatus(eventos, ESTATUS_ORDENADOS, umbral),
      hastaPrimeraRevision: tiempoHastaHito(eventos, (e) => e !== ESTATUS.RECIBIDO, minimo),
      hastaConclusion: tiempoHastaHito(eventos, (e) => e === ESTATUS.CONCLUIDO, minimo),
    };
  }

  /** Casos pendientes (Recibido o En revisión) sin cambios en más de N días. */
  @Requiere('estadisticas.ver')
  @Get('sin-atender')
  async sinAtender(@Query() f: SinAtenderDto): Promise<SinAtenderRespuestaDto> {
    const umbral = umbralMinimo();
    const filas: ConteoDto[] = await this.ds.query(
      `SELECT coalesce(m.nombre, 'Sin municipio') AS etiqueta, count(*)::int AS total
       ${DESDE_FILTRADO.replace('WHERE', 'LEFT JOIN municipio m ON m.id_municipio = r.id_municipio WHERE')}
         AND e.nombre = ANY($7::text[]) AND c.fecha_actualizacion < now() - make_interval(days => $8::int)
       GROUP BY 1 ORDER BY 2 DESC, 1`, [...parametros(f), PENDIENTES, f.dias]);
    return { dias: f.dias, total: filas.reduce((s, x) => s + x.total, 0), umbral, porMunicipio: proteger(filas, umbral) };
  }

  /** Mapa de calor: conteos por celda de ≈ 550 m; celdas con pocos reportes ocultas. */
  @Requiere('estadisticas.ver')
  @Get('mapa-calor')
  async mapaCalor(@Query() f: FiltrosEstadisticasDto): Promise<MapaCalorDto> {
    const umbral = umbralMinimo();
    const filas: { lat: string | null; lng: string | null }[] = await this.ds.query(
      `SELECT u.latitud AS lat, u.longitud AS lng
       ${DESDE_FILTRADO.replace('WHERE', 'JOIN ubicacion u ON u.id_ubicacion = r.id_ubicacion WHERE')}`, parametros(f));
    const puntos = filas.filter((x) => x.lat !== null && x.lng !== null).map((x) => ({ lat: Number(x.lat), lng: Number(x.lng) }));
    const { celdas, ocultas } = celdasDeCalor(puntos, umbral);
    return { umbral, tamanoCelda: TAMANO_CELDA_GRADOS, celdas, ocultas, sinUbicacion: filas.length - puntos.length };
  }
}
