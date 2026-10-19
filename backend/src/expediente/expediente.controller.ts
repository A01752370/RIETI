import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Patch, Query, Req } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';
import { Requiere } from '../auth/roles';
import { RequestAutenticado } from '../auth/jwt.guard';
import { alcanceDe, exigirAlcance, parametroAlcance } from '../auth/alcance';
import { configuracion } from '../config/configuracion';
import { VERIFICACIONES } from '../reportes/reporte.dto';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Catálogos del expediente (Fase 7). Solo personal. */
export interface CatalogosExpedienteDto {
  /** Dependencias activas (editables por el Administrador). */
  dependencias: { id: number; nombre: string }[];
  /** Modalidades de trabajo infantil (las asigna el personal, nunca el ciudadano). */
  modalidades: { id: number; nombre: string }[];
  verificaciones: string[];
  /** Tipos de entrada de bitácora que el personal puede registrar. */
  tiposAccion: string[];
}

/** Filtro de `GET /api/v1/alertas`. */
export class FiltroAlertasDto {
  /** `abierta` (por omisión), `atendida` o `todas`. */
  @IsOptional()
  @IsIn(['abierta', 'atendida', 'todas'])
  estatus?: 'abierta' | 'atendida' | 'todas';
}

/** Cuerpo de `PATCH /api/v1/alertas/:id`. */
export class AtenderAlertaDto {
  @IsIn(['atendida', 'abierta'])
  estatus: 'atendida' | 'abierta';

  /** Qué se hizo (obligatorio en la interfaz al atender; opcional en el contrato). */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  comentario?: string;
}

/** Alerta de punto recurrente (Fase 7). Las coordenadas son el centro aproximado (5 decimales). */
export interface AlertaDto {
  id: number;
  municipio: string | null;
  latitud: number;
  longitud: number;
  /** Reportes en el radio y la ventana al momento de la última actualización. */
  reportes: number;
  estatus: 'abierta' | 'atendida';
  fechaCreacion: string;
  fechaActualizacion: string;
  comentario: string | null;
  /** Reportes recientes en el radio (para abrirlos desde la alerta). */
  relacionados: { id: number; folio: string }[];
}

/** Acciones tipadas sugeridas para la bitácora (texto libre después del tipo). */
export const TIPOS_ACCION = ['Visita', 'Llamada', 'Entrevista', 'Canalización', 'Coordinación interinstitucional', 'Otra'];

/**
 * Expediente interno (Fase 7): catálogos y alertas territoriales de punto recurrente.
 * Las alertas solo se muestran al personal y respetan su alcance territorial; no se
 * envían correos ni notificaciones.
 */
@Controller()
export class ExpedienteController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Requiere('reportes.ver')
  @Get('catalogos/expediente')
  async catalogos(): Promise<CatalogosExpedienteDto> {
    const [dependencias, modalidades] = await Promise.all([
      this.ds.query('SELECT id_dependencia AS id, nombre FROM dependencia WHERE activo ORDER BY orden, nombre'),
      this.ds.query('SELECT id_modalidad AS id, nombre FROM modalidad ORDER BY orden, nombre'),
    ]) as [{ id: number; nombre: string }[], { id: number; nombre: string }[]];
    const num = (l: { id: number; nombre: string }[]) => l.map((x) => ({ id: Number(x.id), nombre: x.nombre }));
    return { dependencias: num(dependencias), modalidades: num(modalidades), verificaciones: [...VERIFICACIONES], tiposAccion: TIPOS_ACCION };
  }

  /** Alertas de punto recurrente de los municipios de quien consulta. */
  @Requiere('alertas.ver')
  @Get('alertas')
  async listar(@Query() f: FiltroAlertasDto, @Req() req: RequestAutenticado): Promise<AlertaDto[]> {
    const alcance = await alcanceDe(this.ds, req.usuario!);
    const estatus = f.estatus ?? 'abierta';
    const filas: { id: number; municipio: string | null; id_municipio: number; latitud: string; longitud: string; reportes: number;
      estatus: 'abierta' | 'atendida'; fecha_creacion: Date; fecha_actualizacion: Date; comentario: string | null }[] = await this.ds.query(
      `SELECT a.id_alerta AS id, m.nombre AS municipio, a.id_municipio, a.latitud, a.longitud, a.reportes, a.estatus,
              a.fecha_creacion, a.fecha_actualizacion, a.comentario
       FROM alerta_territorial a LEFT JOIN municipio m ON m.id_municipio = a.id_municipio
       WHERE ($1::text = 'todas' OR a.estatus = $1::text)
         AND ($2::int[] IS NULL OR a.id_municipio = ANY($2::int[]))
       ORDER BY a.estatus, a.fecha_actualizacion DESC
       LIMIT 200`, [estatus, parametroAlcance(alcance)]);
    const radio = await configuracion(this.ds, 'alerta_radio_m', 150);
    const dias = await configuracion(this.ds, 'alerta_dias', 30);
    return Promise.all(filas.map(async (a) => {
      const relacionados: { id: number; folio: string }[] = await this.ds.query(
        `SELECT r.id_reporte AS id, f.codigo AS folio
         FROM reporte r JOIN ubicacion u ON u.id_ubicacion = r.id_ubicacion JOIN folio f ON f.id_reporte = r.id_reporte
         WHERE r.id_municipio = $1 AND u.latitud IS NOT NULL
           AND r.fecha_creacion BETWEEN $5::timestamptz - make_interval(days => $4::int) AND $6::timestamptz
           AND ST_DWithin(ST_SetSRID(ST_MakePoint(u.longitud, u.latitud), 4326)::geography,
                          ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $7)
         ORDER BY r.fecha_creacion DESC LIMIT 10`,
        [a.id_municipio, a.latitud, a.longitud, dias, a.fecha_creacion, a.fecha_actualizacion, radio]);
      return {
        id: Number(a.id), municipio: a.municipio, latitud: Number(a.latitud), longitud: Number(a.longitud), reportes: a.reportes,
        estatus: a.estatus, fechaCreacion: new Date(a.fecha_creacion).toISOString(), fechaActualizacion: new Date(a.fecha_actualizacion).toISOString(),
        comentario: a.comentario, relacionados: relacionados.map((r) => ({ id: Number(r.id), folio: r.folio })),
      };
    }));
  }

  /** Marca una alerta como atendida (o la reabre). Otro municipio responde 404. */
  @Requiere('alertas.gestionar')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Patch('alertas/:id')
  async atender(@Param('id', ParseIntPipe) id: number, @Body() dto: AtenderAlertaDto, @Req() req: RequestAutenticado): Promise<{ id: number; estatus: string }> {
    const alcance = await alcanceDe(this.ds, req.usuario!);
    const [alerta] = await this.ds.query('SELECT id_municipio FROM alerta_territorial WHERE id_alerta = $1', [id]);
    if (!alerta) throw new NotFoundException('Alerta no encontrada');
    try {
      exigirAlcance(alcance, alerta.id_municipio);
    } catch {
      throw new NotFoundException('Alerta no encontrada');
    }
    await this.ds.query(
      `UPDATE alerta_territorial SET estatus = $2::text, comentario = $3::text, fecha_actualizacion = now(),
              id_usuario_atendio = CASE WHEN $2::text = 'atendida' THEN $4::int ELSE NULL END
       WHERE id_alerta = $1`, [id, dto.estatus, dto.comentario ?? null, alcance.idUsuario]);
    return { id, estatus: dto.estatus };
  }
}
