import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { UsuarioAutenticado } from '../auth/auth.dto';
import { AuthOpcional, GRUPOS_PERSONAL, Roles } from '../auth/roles';
import { ActualizarReporteDto, CrearReporteDto, ReporteRespuestaDto } from './reporte.dto';
import { redactarParaCiudadano, ReportesService } from './reportes.service';

type RequestAutenticado = Request & { usuario?: UsuarioAutenticado };

@Controller('reportes')
export class ReportesController {
  constructor(
    private readonly reportes: ReportesService,
    private readonly auth: AuthService,
  ) {}

  /** CU-04: reporte ciudadano anónimo. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  crear(@Body() dto: CrearReporteDto): Promise<ReporteRespuestaDto> {
    return this.reportes.crear(dto);
  }

  /** CU-09: listado para personal SIPINNA. */
  @Roles(...GRUPOS_PERSONAL)
  @Get()
  listar(): Promise<ReporteRespuestaDto[]> {
    return this.reportes.listar();
  }

  /** CU-08: consulta por folio. Anónimo → solo estatus; personal → reporte completo. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @AuthOpcional()
  @Get('folio/:folio')
  async buscarPorFolio(@Param('folio') folio: string, @Req() req: RequestAutenticado): Promise<ReporteRespuestaDto> {
    const reporte = await this.reportes.buscarPorFolio(folio);
    const esPersonal = req.usuario?.grupos.some((g) => GRUPOS_PERSONAL.includes(g)) ?? false;
    return esPersonal ? reporte : redactarParaCiudadano(reporte);
  }

  /** CU-09/CU-10: cambia estatus y agrega seguimiento. */
  @Roles(...GRUPOS_PERSONAL)
  @Patch(':id')
  async actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarReporteDto,
    @Req() req: RequestAutenticado,
  ): Promise<ReporteRespuestaDto> {
    const usuario = req.usuario ? await this.auth.buscarPorSub(req.usuario.sub) : null;
    return this.reportes.actualizar(id, dto, usuario);
  }
}
