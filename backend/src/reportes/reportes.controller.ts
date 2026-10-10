import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Publico, Requiere } from '../auth/roles';
import { RequestAutenticado } from '../auth/jwt.guard';
import {
  AgregarSeguimientoDto, CambiarEstatusDto, ConsultaPublicaDto, ConsultarReporteDto, CrearReporteDto,
  ListarReportesDto, PaginaDto, ReporteCreadoDto, ReporteDetalleDto, ReporteResumenDto,
} from './reporte.dto';
import { ReportesService } from './reportes.service';

/**
 * Rutas de reportes (`/api/v1/reportes`).
 *
 * Públicas (decisión explícita, `@Publico`): registrar un reporte y consultarlo
 * con folio + clave. Todo lo demás exige JWT de personal SIPINNA.
 */
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  /** CU-04: registra un reporte anónimo. 5 por minuto por IP (spam, ataque A9). */
  @Publico()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  crear(@Body() dto: CrearReporteDto): Promise<ReporteCreadoDto> {
    return this.reportes.crear(dto);
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

  /** CU-09: bandeja del personal con filtros (estatus, municipio) y paginación. */
  @Requiere('reportes.ver')
  @Get()
  listar(@Query() filtros: ListarReportesDto): Promise<PaginaDto<ReporteResumenDto>> {
    return this.reportes.listar(filtros);
  }

  /** CU-09: detalle del reporte con bitácora y transiciones permitidas. */
  @Requiere('reportes.ver')
  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number): Promise<ReporteDetalleDto> {
    return this.reportes.detalle(id);
  }

  /** CU-09/CU-10: cambia el estatus según la máquina de estados. */
  @Requiere('reportes.gestionar')
  @Patch(':id/estatus')
  cambiarEstatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstatusDto,
    @Req() req: RequestAutenticado,
  ): Promise<ReporteDetalleDto> {
    return this.reportes.cambiarEstatus(id, dto, req.usuario!.idUsuario);
  }

  /** Agrega una nota de seguimiento sin cambiar el estatus. */
  @Requiere('reportes.gestionar')
  @Post(':id/seguimientos')
  agregarSeguimiento(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AgregarSeguimientoDto,
    @Req() req: RequestAutenticado,
  ): Promise<ReporteDetalleDto> {
    return this.reportes.agregarSeguimiento(id, dto, req.usuario!.idUsuario);
  }
}
