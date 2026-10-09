import { Controller, Get, Query } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';
import { DataSource } from 'typeorm';
import { Requiere } from '../auth/roles';
import { ESTATUS_ORDENADOS } from '../reportes/estatus';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Filtros del panel: rango de fechas (inclusive) y municipio. */
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
  /** Los 6 estatus canónicos en el orden del proceso, incluso con 0. */
  porEstatus: ConteoDto[];
  /** Por mes `AAAA-MM`, del más antiguo al más reciente. */
  porMes: ConteoDto[];
}

/** Zona horaria de referencia para agrupar por día y mes. */
const ZONA = 'America/Mexico_City';

/** Panel de estadísticas del personal (solo datos agregados, sin PII). */
@Controller('estadisticas')
export class EstadisticasController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Tarjetas, conteo por estatus y serie mensual con los filtros indicados. */
  @Requiere('estadisticas.ver')
  @Get('resumen')
  async resumen(@Query() f: FiltrosEstadisticasDto): Promise<ResumenEstadisticasDto> {
    const params = [f.desde ?? null, f.hasta ?? null, f.municipioId ?? null, ZONA];
    const filtro = `
      WHERE ($1::date IS NULL OR (r.fecha_creacion AT TIME ZONE $4)::date >= $1::date)
        AND ($2::date IS NULL OR (r.fecha_creacion AT TIME ZONE $4)::date <= $2::date)
        AND ($3::int IS NULL OR r.id_municipio = $3::int)`;

    const [[tarjetas], estatus, meses] = await Promise.all([
      this.ds.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE r.fecha_creacion >= now() - interval '7 days')::int AS nuevos,
                count(*) FILTER (WHERE r.id_municipio IS NULL)::int AS sin_municipio
         FROM reporte r ${filtro}`, params),
      this.ds.query(
        `SELECT e.nombre AS etiqueta, count(*)::int AS total
         FROM reporte r
         JOIN reporte_caso rc ON rc.id_reporte = r.id_reporte
         JOIN caso c ON c.id_caso = rc.id_caso
         JOIN estatus_reporte e ON e.id_estatus = c.id_estatus
         ${filtro}
         GROUP BY e.nombre`, params),
      this.ds.query(
        `SELECT to_char(date_trunc('month', r.fecha_creacion AT TIME ZONE $4), 'YYYY-MM') AS etiqueta, count(*)::int AS total
         FROM reporte r ${filtro}
         GROUP BY 1 ORDER BY 1`, params),
    ]) as [[{ total: number; nuevos: number; sin_municipio: number }], ConteoDto[], ConteoDto[]];

    const porNombre = new Map(estatus.map((e) => [e.etiqueta, e.total]));
    return {
      total: tarjetas.total,
      nuevosUltimos7Dias: tarjetas.nuevos,
      sinMunicipio: tarjetas.sin_municipio,
      porEstatus: ESTATUS_ORDENADOS.map((e) => ({ etiqueta: e, total: porNombre.get(e) ?? 0 })),
      porMes: meses,
    };
  }
}
