import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { CiudadanoOpcional, Publico, Requiere } from '../auth/roles';
import { RequestAutenticado } from '../auth/jwt.guard';
import { Alcance, alcanceDe } from '../auth/alcance';
import {
  ActualizarExpedienteDto, AgregarSeguimientoDto, CambiarEstatusDto, ConsultaPublicaDto, ConsultarReporteDto, CrearReporteDto,
  FiltrosBandejaDto, ListarReportesDto, PaginaDto, ReporteCreadoDto, ReporteDetalleDto, ReporteRelacionadoDto, ReporteResumenDto,
  VincularDuplicadoDto,
} from './reporte.dto';
import { ReportesService } from './reportes.service';

/**
 * Rutas de reportes (`/api/v1/reportes`).
 *
 * Públicas (decisión explícita, `@Publico`): registrar un reporte y consultarlo
 * con folio + clave. Todo lo demás exige JWT de personal SIPINNA y se limita al
 * alcance territorial de quien consulta (Fase 7): un reporte de otro municipio
 * responde el mismo 404 que uno inexistente.
 */
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportes: ReportesService, private readonly ds: DataSource) {}

  private alcance(req: RequestAutenticado): Promise<Alcance> {
    return alcanceDe(this.ds, req.usuario!);
  }

  /**
   * CU-04: registra un reporte (anónimo por defecto). 5 por minuto por IP (spam, ataque A9).
   * Con un token de ciudadano y `vincularCuenta: true`, el reporte queda ligado a la cuenta (Fase 4).
   */
  @Publico()
  @CiudadanoOpcional()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  crear(@Body() dto: CrearReporteDto, @Req() req: RequestAutenticado): Promise<ReporteCreadoDto> {
    if (dto.vincularCuenta && !req.ciudadano) {
      throw new BadRequestException({ codigo: 'SESION_REQUERIDA', mensaje: 'Inicia sesión para vincular el reporte a tu cuenta' });
    }
    return this.reportes.crear(dto, dto.vincularCuenta ? req.ciudadano!.idCuenta : null);
  }

  /**
   * CU-08: consulta ciudadana con folio + clave. Por POST para que la clave no
   * quede en URLs ni en logs de acceso. 10 por minuto por IP, además del
   * bloqueo por folio tras 5 fallos (ataque A1).
   */
  @Publico()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('consulta')
  @HttpCode(200)
  consultar(@Body() dto: ConsultarReporteDto): Promise<ConsultaPublicaDto> {
    return this.reportes.consultar(dto.folio, dto.clave);
  }

  /** CU-09: bandeja del personal con filtros y paginación, limitada a sus municipios. */
  @Requiere('reportes.ver')
  @Get()
  async listar(@Query() filtros: ListarReportesDto, @Req() req: RequestAutenticado): Promise<PaginaDto<ReporteResumenDto>> {
    return this.reportes.listar(filtros, await this.alcance(req));
  }

  /**
   * Exporta la bandeja filtrada a CSV (máximo 5,000 filas). Solo columnas de la
   * bandeja: sin descripción libre ni coordenadas (minimización). 10 por minuto.
   * Queda en la bitácora de accesos. Debe declararse antes de `:id`.
   */
  @Requiere('reportes.exportar')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('exportar.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="reportes-rieti.csv"')
  @Header('Cache-Control', 'no-store')
  async exportar(@Query() f: FiltrosBandejaDto, @Req() req: RequestAutenticado): Promise<string> {
    return this.reportes.exportarCsv(f, await this.alcance(req));
  }

  /** CU-09: detalle del reporte con bitácora, transiciones y expediente. Queda en la bitácora de accesos. */
  @Requiere('reportes.ver')
  @Get(':id')
  async detalle(@Param('id', ParseIntPipe) id: number, @Req() req: RequestAutenticado): Promise<ReporteDetalleDto> {
    return this.reportes.detalle(id, await this.alcance(req), true);
  }

  /** CU-09/CU-10: cambia el estatus según la máquina de estados. */
  @Requiere('reportes.gestionar')
  @Patch(':id/estatus')
  async cambiarEstatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstatusDto,
    @Req() req: RequestAutenticado,
  ): Promise<ReporteDetalleDto> {
    return this.reportes.cambiarEstatus(id, dto, await this.alcance(req));
  }

  /** Agrega una nota interna o una acción realizada sin cambiar el estatus. */
  @Requiere('reportes.gestionar')
  @Post(':id/seguimientos')
  async agregarSeguimiento(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AgregarSeguimientoDto,
    @Req() req: RequestAutenticado,
  ): Promise<ReporteDetalleDto> {
    return this.reportes.agregarSeguimiento(id, dto, await this.alcance(req));
  }

  /** Fase 7: edita el expediente (responsable, dependencia, seguimiento, verificación, NNA). 30 por minuto. */
  @Requiere('expediente.editar')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Patch(':id/expediente')
  async actualizarExpediente(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarExpedienteDto,
    @Req() req: RequestAutenticado,
  ): Promise<ReporteDetalleDto> {
    return this.reportes.actualizarExpediente(id, dto, await this.alcance(req));
  }

  /** Fase 7: posibles duplicados (mismo municipio, radio y ventana configurados). Solo sugerencias. */
  @Requiere('reportes.ver')
  @Get(':id/cercanos')
  async cercanos(@Param('id', ParseIntPipe) id: number, @Req() req: RequestAutenticado): Promise<ReporteRelacionadoDto[]> {
    return this.reportes.cercanos(id, await this.alcance(req));
  }

  /** Fase 7: marca el reporte como posible duplicado de otro (nunca se fusiona ni se borra). */
  @Requiere('expediente.editar')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/duplicado')
  @HttpCode(200)
  async vincularDuplicado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VincularDuplicadoDto,
    @Req() req: RequestAutenticado,
  ): Promise<ReporteDetalleDto> {
    return this.reportes.vincularDuplicado(id, dto.idPrincipal, await this.alcance(req));
  }

  /** Fase 7: deshace el vínculo de posible duplicado. */
  @Requiere('expediente.editar')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Delete(':id/duplicado')
  async desvincularDuplicado(@Param('id', ParseIntPipe) id: number, @Req() req: RequestAutenticado): Promise<ReporteDetalleDto> {
    return this.reportes.desvincularDuplicado(id, await this.alcance(req));
  }

  /** Fase 7: personal que puede ser responsable del reporte (activo y con acceso a su municipio). */
  @Requiere('expediente.editar')
  @Get(':id/responsables')
  async responsables(@Param('id', ParseIntPipe) id: number, @Req() req: RequestAutenticado): Promise<{ id: number; correo: string; perfil: string }[]> {
    return this.reportes.responsables(id, await this.alcance(req));
  }
}
