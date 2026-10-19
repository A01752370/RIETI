import { Controller, Get, Query, Req } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { DataSource } from 'typeorm';
import { Requiere } from '../auth/roles';
import { RequestAutenticado } from '../auth/jwt.guard';
import { Alcance, alcanceDe, parametroAlcance } from '../auth/alcance';
import { ESTATUS, ESTATUS_CERRADOS, ESTATUS_ORDENADOS, ESTATUS_PENDIENTES } from '../reportes/estatus';
import { PRIORIDADES } from '../reportes/clasificacion';
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

  /** Prioridad (`Alta`, `Media`, `Normal`; Fase 6). */
  @IsOptional()
  @IsIn(PRIORIDADES)
  prioridad?: string;
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
  /** Pendientes con prioridad Alta: quien reportó indicó peligro inmediato (Fase 6). */
  prioridadAltaPendientes: number;
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

/** Respuesta de `GET /api/v1/estadisticas/embudo` (Fase 7). Solo conteos. */
export interface EmbudoDto {
  /** Reportes recibidos sin contar los marcados como posibles duplicados. */
  recibidos: number;
  /** Con verificación "Verificado" o "Caso confirmado". */
  verificados: number;
  /** Con verificación "Caso confirmado". */
  casosIdentificados: number;
  /** Suma de NNA identificados que capturó el personal. */
  nnaIdentificados: number;
  /** Suma de NNA canalizados que capturó el personal. */
  nnaCanalizados: number;
  /** Reportes marcados como posibles duplicados (no cuentan en el embudo). */
  duplicadosDescontados: number;
  prioridadAltaPendientes: number;
  /** Casos abiertos con la fecha de seguimiento vencida. */
  seguimientosVencidos: number;
  /** Alertas de punto recurrente abiertas. */
  alertasAbiertas: number;
}

/** Zona horaria de referencia para agrupar por día y mes. */
const ZONA = 'America/Mexico_City';

/** Estatus que cuentan como "pendientes de atender". */
const PENDIENTES = [...ESTATUS_PENDIENTES];

/**
 * Cláusula FROM/WHERE común a todas las estadísticas (consultas parametrizadas:
 * $1 desde, $2 hasta, $3 municipio, $4 zona, $5 estatus, $6 actividad, $7 prioridad,
 * $8 alcance territorial: `null` o los municipios asignados; Fase 7).
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
    AND ($6::text IS NULL OR a.nombre = $6::text)
    AND ($7::text IS NULL OR r.prioridad = $7::text)
    AND ($8::int[] IS NULL OR r.id_municipio = ANY($8::int[]))`;

const parametros = (f: FiltrosEstadisticasDto, a: Alcance) =>
  [f.desde ?? null, f.hasta ?? null, f.municipioId ?? null, ZONA, f.estatus ?? null, f.actividad ?? null, f.prioridad ?? null,
    parametroAlcance(a)];

/**
 * Panel de estadísticas del personal (`estadisticas.ver`). Solo datos agregados,
 * sin PII; las celdas pequeñas se ocultan con un umbral (ver {@link umbralMinimo}).
 */
@Controller('estadisticas')
export class EstadisticasController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private alcance(req: RequestAutenticado): Promise<Alcance> {
    return alcanceDe(this.ds, req.usuario!);
  }

  /** Tarjetas, conteo por estatus y serie mensual con los filtros indicados. */
  @Requiere('estadisticas.ver')
  @Get('resumen')
  async resumen(@Query() f: FiltrosEstadisticasDto, @Req() req: RequestAutenticado): Promise<ResumenEstadisticasDto> {
    const params = parametros(f, await this.alcance(req));
    const [[tarjetas], estatus, meses] = await Promise.all([
      this.ds.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE r.fecha_creacion >= now() - interval '7 days')::int AS nuevos,
                count(*) FILTER (WHERE r.id_municipio IS NULL)::int AS sin_municipio,
                count(*) FILTER (WHERE e.nombre = ANY($9::text[]))::int AS pendientes,
                count(*) FILTER (WHERE e.nombre = ANY($9::text[]) AND ri.nombre = 'Sí')::int AS riesgo_alto,
                count(*) FILTER (WHERE e.nombre = ANY($9::text[]) AND r.prioridad = 'Alta')::int AS prioridad_alta
         ${DESDE_FILTRADO.replace('WHERE', 'JOIN riesgo ri ON ri.id_riesgo = r.id_riesgo WHERE')}`, [...params, PENDIENTES]),
      this.ds.query(`SELECT e.nombre AS etiqueta, count(*)::int AS total ${DESDE_FILTRADO} GROUP BY e.nombre`, params),
      this.ds.query(
        `SELECT to_char(date_trunc('month', r.fecha_creacion AT TIME ZONE $4), 'YYYY-MM') AS etiqueta, count(*)::int AS total
         ${DESDE_FILTRADO} GROUP BY 1 ORDER BY 1`, params),
    ]) as [[{ total: number; nuevos: number; sin_municipio: number; pendientes: number; riesgo_alto: number; prioridad_alta: number }], ConteoDto[], ConteoDto[]];

    const porNombre = new Map(estatus.map((e) => [e.etiqueta, e.total]));
    return {
      total: tarjetas.total,
      nuevosUltimos7Dias: tarjetas.nuevos,
      sinMunicipio: tarjetas.sin_municipio,
      pendientes: tarjetas.pendientes,
      riesgoAltoPendientes: tarjetas.riesgo_alto,
      prioridadAltaPendientes: tarjetas.prioridad_alta,
      porEstatus: ESTATUS_ORDENADOS.map((e) => ({ etiqueta: e, total: porNombre.get(e) ?? 0 })),
      porMes: meses,
    };
  }

  /** Distribución por municipio, actividad y grupo de edad (celdas pequeñas ocultas). */
  @Requiere('estadisticas.ver')
  @Get('distribuciones')
  async distribuciones(@Query() f: FiltrosEstadisticasDto, @Req() req: RequestAutenticado): Promise<DistribucionesDto> {
    const params = parametros(f, await this.alcance(req));
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
         GROUP BY re.nombre, re.orden ORDER BY re.orden`, params),
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
  async tiempos(@Query() f: FiltrosEstadisticasDto, @Req() req: RequestAutenticado): Promise<TiemposDto> {
    const umbral = umbralMinimo();
    const filas: { id_caso: number; estatus: string; fecha: Date }[] = await this.ds.query(
      `SELECT s.id_caso, es.nombre AS estatus, s.fecha
       FROM seguimiento s JOIN estatus_reporte es ON es.id_estatus = s.id_estatus
       WHERE s.id_caso IN (SELECT c.id_caso ${DESDE_FILTRADO})
       ORDER BY s.id_caso, s.fecha, s.id_seguimiento`, parametros(f, await this.alcance(req)));
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
  async sinAtender(@Query() f: SinAtenderDto, @Req() req: RequestAutenticado): Promise<SinAtenderRespuestaDto> {
    const umbral = umbralMinimo();
    const filas: ConteoDto[] = await this.ds.query(
      `SELECT coalesce(m.nombre, 'Sin municipio') AS etiqueta, count(*)::int AS total
       ${DESDE_FILTRADO.replace('WHERE', 'LEFT JOIN municipio m ON m.id_municipio = r.id_municipio WHERE')}
         AND e.nombre = ANY($9::text[]) AND c.fecha_actualizacion < now() - make_interval(days => $10::int)
       GROUP BY 1 ORDER BY 2 DESC, 1`, [...parametros(f, await this.alcance(req)), PENDIENTES, f.dias]);
    return { dias: f.dias, total: filas.reduce((s, x) => s + x.total, 0), umbral, porMunicipio: proteger(filas, umbral) };
  }

  /**
   * Fase 7: embudo de atención (recibidos → verificados → casos identificados → NNA
   * canalizados), sin contar los posibles duplicados, más los indicadores de control.
   */
  @Requiere('estadisticas.ver')
  @Get('embudo')
  async embudo(@Query() f: FiltrosEstadisticasDto, @Req() req: RequestAutenticado): Promise<EmbudoDto> {
    const alcance = await this.alcance(req);
    const [[fila]] = await Promise.all([
      this.ds.query(
        `SELECT count(*) FILTER (WHERE r.duplicado_de IS NULL)::int AS recibidos,
                count(*) FILTER (WHERE r.duplicado_de IS NOT NULL)::int AS duplicados,
                count(*) FILTER (WHERE r.duplicado_de IS NULL AND c.verificacion IN ('Verificado', 'Caso confirmado'))::int AS verificados,
                count(*) FILTER (WHERE r.duplicado_de IS NULL AND c.verificacion = 'Caso confirmado')::int AS casos,
                coalesce(sum(c.nna_identificados) FILTER (WHERE r.duplicado_de IS NULL), 0)::int AS nna_identificados,
                coalesce(sum(c.nna_canalizados) FILTER (WHERE r.duplicado_de IS NULL), 0)::int AS nna_canalizados,
                count(*) FILTER (WHERE r.duplicado_de IS NULL AND r.prioridad = 'Alta' AND e.nombre = ANY($9::text[]))::int AS alta_pendientes,
                count(*) FILTER (WHERE c.fecha_seguimiento < (now() AT TIME ZONE $4)::date AND e.nombre <> ALL($10::text[]))::int AS vencidos
         ${DESDE_FILTRADO}`, [...parametros(f, alcance), PENDIENTES, [...ESTATUS_CERRADOS]]),
    ]);
    const [{ alertas }] = await this.ds.query(
      `SELECT count(*)::int AS alertas FROM alerta_territorial
       WHERE estatus = 'abierta' AND ($1::int[] IS NULL OR id_municipio = ANY($1::int[]))
         AND ($2::int IS NULL OR id_municipio = $2::int)`, [parametroAlcance(alcance), f.municipioId ?? null]);
    return {
      recibidos: fila.recibidos,
      verificados: fila.verificados,
      casosIdentificados: fila.casos,
      nnaIdentificados: fila.nna_identificados,
      nnaCanalizados: fila.nna_canalizados,
      duplicadosDescontados: fila.duplicados,
      prioridadAltaPendientes: fila.alta_pendientes,
      seguimientosVencidos: fila.vencidos,
      alertasAbiertas: alertas,
    };
  }

  /** Mapa de calor: conteos por celda de ≈ 550 m; celdas con pocos reportes ocultas. */
  @Requiere('estadisticas.ver')
  @Get('mapa-calor')
  async mapaCalor(@Query() f: FiltrosEstadisticasDto, @Req() req: RequestAutenticado): Promise<MapaCalorDto> {
    const umbral = umbralMinimo();
    const filas: { lat: string | null; lng: string | null }[] = await this.ds.query(
      `SELECT u.latitud AS lat, u.longitud AS lng
       ${DESDE_FILTRADO.replace('WHERE', 'JOIN ubicacion u ON u.id_ubicacion = r.id_ubicacion WHERE')}`, parametros(f, await this.alcance(req)));
    const puntos = filas.filter((x) => x.lat !== null && x.lng !== null).map((x) => ({ lat: Number(x.lat), lng: Number(x.lng) }));
    const { celdas, ocultas } = celdasDeCalor(puntos, umbral);
    return { umbral, tamanoCelda: TAMANO_CELDA_GRADOS, celdas, ocultas, sinUbicacion: filas.length - puntos.length };
  }
}
