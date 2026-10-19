import { Controller, Get, Query, Req } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
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

/**
 * Franjas horarias (Fase 9) sobre la hora de **registro** del reporte: el formulario no pide
 * la hora en que se observó la situación.
 */
export const FRANJAS = ['madrugada', 'mañana', 'tarde', 'noche'];

/** SQL de la franja de un reporte (0–5 madrugada, 6–11 mañana, 12–17 tarde, 18–23 noche). */
export const SQL_FRANJA = `CASE WHEN extract(hour FROM r.fecha_creacion AT TIME ZONE $4) < 6 THEN 'madrugada'
  WHEN extract(hour FROM r.fecha_creacion AT TIME ZONE $4) < 12 THEN 'mañana'
  WHEN extract(hour FROM r.fecha_creacion AT TIME ZONE $4) < 18 THEN 'tarde' ELSE 'noche' END`;

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

  // ---------- Fase 9: filtros comunes del mapa y las gráficas ----------

  /** Rango de edad (algún menor del reporte en ese rango). */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rangoEdad?: string;

  /** Riesgo percibido (`Sí`, `No`, `No sé`). */
  @IsOptional()
  @IsIn(['Sí', 'No', 'No sé'])
  riesgo?: string;

  /** Franja horaria del registro (hora de la Ciudad de México). */
  @IsOptional()
  @IsIn(FRANJAS)
  franja?: string;

  /** Dependencia a la que se canalizó (`id`). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dependenciaId?: number;

  /** Verificación del expediente. */
  @IsOptional()
  @IsIn(['Sin verificar', 'Verificado', 'Caso confirmado', 'No procede'])
  verificacion?: string;

  /** Solo reportes en puntos recurrentes (dentro del radio de una alerta de su municipio). */
  @IsOptional()
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value))
  @IsBoolean()
  reincidente?: boolean;

  /** `ciudadano` o `institucional` (detección en recorridos). */
  @IsOptional()
  @IsIn(['ciudadano', 'institucional'])
  origen?: string;
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
  /** Niñas y niños que capturó el personal en el expediente (Fase 9; solo agregado con umbral). */
  porSexo?: ConteoProtegidoDto[];
  /** Reportes por franja horaria de registro (Fase 9). */
  porFranja?: ConteoProtegidoDto[];
  /** Reportes por dependencia de canalización (Fase 9). */
  porDependencia?: ConteoProtegidoDto[];
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
export const ZONA = 'America/Mexico_City';

/** Estatus que cuentan como "pendientes de atender". */
const PENDIENTES = [...ESTATUS_PENDIENTES];

/**
 * Cláusula FROM/WHERE común a todas las estadísticas (consultas parametrizadas:
 * $1 desde, $2 hasta, $3 municipio, $4 zona, $5 estatus, $6 actividad, $7 prioridad,
 * $8 alcance territorial: `null` o los municipios asignados; Fase 7; Fase 9: $9 rango de edad,
 * $10 riesgo, $11 franja, $12 dependencia, $13 verificación, $14 solo puntos recurrentes, $15 origen).
 * Los parámetros propios de cada consulta empiezan en $16.
 */
export const DESDE_FILTRADO = `
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
    AND ($8::int[] IS NULL OR r.id_municipio = ANY($8::int[]))
    AND ($9::text IS NULL OR EXISTS (SELECT 1 FROM reporte_menores_grupo g9 JOIN rango_edad re9 ON re9.id_rango_edad = g9.id_rango_edad
         WHERE g9.id_reporte = r.id_reporte AND re9.nombre = $9::text))
    AND ($10::text IS NULL OR r.id_riesgo = (SELECT id_riesgo FROM riesgo WHERE nombre = $10::text))
    AND ($11::text IS NULL OR (${SQL_FRANJA}) = $11::text)
    AND ($12::int IS NULL OR c.id_dependencia = $12::int)
    AND ($13::text IS NULL OR c.verificacion = $13::text)
    AND ($14::boolean IS NOT TRUE OR EXISTS (
         SELECT 1 FROM ubicacion u14 JOIN alerta_territorial at14 ON at14.id_municipio = r.id_municipio
         WHERE u14.id_ubicacion = r.id_ubicacion AND u14.punto IS NOT NULL
           AND ST_DWithin(u14.punto, ST_SetSRID(ST_MakePoint(at14.longitud, at14.latitud), 4326)::geography,
                          coalesce((SELECT valor FROM configuracion WHERE clave = 'alerta_radio_m'), 150))))
    AND ($15::text IS NULL OR r.origen = $15::text)`;

export const parametros = (f: FiltrosEstadisticasDto, a: Alcance) =>
  [f.desde ?? null, f.hasta ?? null, f.municipioId ?? null, ZONA, f.estatus ?? null, f.actividad ?? null, f.prioridad ?? null,
    parametroAlcance(a), f.rangoEdad ?? null, f.riesgo ?? null, f.franja ?? null, f.dependenciaId ?? null, f.verificacion ?? null,
    f.reincidente ?? null, f.origen ?? null];

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
                count(*) FILTER (WHERE e.nombre = ANY($16::text[]))::int AS pendientes,
                count(*) FILTER (WHERE e.nombre = ANY($16::text[]) AND ri.nombre = 'Sí')::int AS riesgo_alto,
                count(*) FILTER (WHERE e.nombre = ANY($16::text[]) AND r.prioridad = 'Alta')::int AS prioridad_alta
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
    const [municipios, actividades, edades, sexo, franjas, dependencias] = await Promise.all([
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
      // Fase 9: sexo solo como suma agregada (lo captura el personal; nunca el ciudadano) y con umbral.
      this.ds.query(
        `SELECT x.etiqueta, x.total FROM (
           SELECT 'Niñas' AS etiqueta, coalesce(sum(c.nna_ninas), 0)::int AS total, 1 AS orden ${DESDE_FILTRADO}
           UNION ALL
           SELECT 'Niños', coalesce(sum(c.nna_ninos), 0)::int, 2 ${DESDE_FILTRADO}) x ORDER BY x.orden`, params),
      this.ds.query(`SELECT ${SQL_FRANJA} AS etiqueta, count(*)::int AS total ${DESDE_FILTRADO} GROUP BY 1`, params),
      this.ds.query(
        `SELECT d.nombre AS etiqueta, count(*)::int AS total
         ${DESDE_FILTRADO.replace('WHERE', 'JOIN dependencia d ON d.id_dependencia = c.id_dependencia WHERE')}
         GROUP BY d.nombre, d.orden ORDER BY d.orden`, params),
    ]) as [ConteoDto[], ConteoDto[], ConteoDto[], ConteoDto[], ConteoDto[], ConteoDto[]];
    const porFranja = new Map(franjas.map((x) => [x.etiqueta, x.total]));
    return {
      umbral,
      porMunicipio: proteger(municipios, umbral),
      porActividad: proteger(actividades, umbral),
      porGrupoEdad: proteger(edades, umbral),
      porSexo: proteger(sexo, umbral),
      porFranja: proteger(FRANJAS.map((etiqueta) => ({ etiqueta, total: porFranja.get(etiqueta) ?? 0 })), umbral),
      porDependencia: proteger(dependencias, umbral),
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
         AND e.nombre = ANY($16::text[]) AND c.fecha_actualizacion < now() - make_interval(days => $17::int)
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
                count(*) FILTER (WHERE r.duplicado_de IS NULL AND r.prioridad = 'Alta' AND e.nombre = ANY($16::text[]))::int AS alta_pendientes,
                count(*) FILTER (WHERE c.fecha_seguimiento < (now() AT TIME ZONE $4)::date AND e.nombre <> ALL($17::text[]))::int AS vencidos
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
