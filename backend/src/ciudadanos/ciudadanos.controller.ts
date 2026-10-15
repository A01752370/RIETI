import { Body, Controller, Delete, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Ciudadano, Publico } from '../auth/roles';
import { RequestAutenticado } from '../auth/jwt.guard';
import {
  CambiarContrasenaDto, ConfirmarDto, CorreoDto, CredencialesDto, CuentaDto, MensajeDto, MiReporteDto, RefrescarDto,
  RestablecerDto, SesionCiudadanoDto,
} from './ciudadanos.dto';
import { CiudadanosService } from './ciudadanos.service';

/** Access token tal como llegó (el guard ya lo validó). */
const tokenDe = (req: RequestAutenticado) => (req.headers.authorization ?? '').split(' ')[1] ?? '';

/**
 * Alta, activación, inicio de sesión y recuperación de cuentas de ciudadano
 * (`/api/v1/ciudadanos`, Fase 4). Públicas por definición, con límites estrictos
 * por IP además de los de Cognito.
 */
@Controller('ciudadanos')
export class CuentasPublicasController {
  constructor(private readonly ciudadanos: CiudadanosService) {}

  @Publico()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('registro')
  @HttpCode(202)
  registrar(@Body() dto: CredencialesDto): Promise<MensajeDto> {
    return this.ciudadanos.registrar(dto.correo, dto.password);
  }

  @Publico()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('confirmar')
  @HttpCode(200)
  confirmar(@Body() dto: ConfirmarDto): Promise<MensajeDto> {
    return this.ciudadanos.confirmar(dto.correo, dto.codigo);
  }

  @Publico()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('reenviar-codigo')
  @HttpCode(202)
  reenviarCodigo(@Body() dto: CorreoDto): Promise<MensajeDto> {
    return this.ciudadanos.reenviarCodigo(dto.correo);
  }

  @Publico()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: CredencialesDto): Promise<SesionCiudadanoDto> {
    return this.ciudadanos.iniciarSesion(dto.correo, dto.password);
  }

  @Publico()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  refrescar(@Body() dto: RefrescarDto): Promise<SesionCiudadanoDto> {
    return this.ciudadanos.refrescar(dto.refreshToken);
  }

  @Publico()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('olvide-contrasena')
  @HttpCode(202)
  olvide(@Body() dto: CorreoDto): Promise<MensajeDto> {
    return this.ciudadanos.olvideContrasena(dto.correo);
  }

  @Publico()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('restablecer-contrasena')
  @HttpCode(200)
  restablecer(@Body() dto: RestablecerDto): Promise<MensajeDto> {
    return this.ciudadanos.restablecerContrasena(dto.correo, dto.codigo, dto.password);
  }
}

/**
 * Cuenta del ciudadano con sesión (`/api/v1/ciudadano`, Fase 4). Solo tokens del
 * pool de **ciudadanos**: un token del personal recibe 401.
 */
@Controller('ciudadano')
export class CuentaCiudadanoController {
  constructor(private readonly ciudadanos: CiudadanosService) {}

  @Ciudadano()
  @Get('cuenta')
  cuenta(@Req() req: RequestAutenticado): Promise<CuentaDto> {
    return this.ciudadanos.cuenta(tokenDe(req), req.ciudadano!.idCuenta);
  }

  @Ciudadano()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('cuenta/contrasena')
  @HttpCode(200)
  cambiarContrasena(@Req() req: RequestAutenticado, @Body() dto: CambiarContrasenaDto): Promise<MensajeDto> {
    return this.ciudadanos.cambiarContrasena(tokenDe(req), dto.actual, dto.nueva);
  }

  @Ciudadano()
  @Post('cuenta/cerrar-sesion')
  @HttpCode(200)
  cerrarSesion(@Req() req: RequestAutenticado): Promise<MensajeDto> {
    return this.ciudadanos.cerrarSesion(tokenDe(req));
  }

  @Ciudadano()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Delete('cuenta')
  eliminar(@Req() req: RequestAutenticado): Promise<MensajeDto> {
    return this.ciudadanos.eliminar(tokenDe(req), req.ciudadano!.idCuenta);
  }

  @Ciudadano()
  @Get('reportes')
  misReportes(@Req() req: RequestAutenticado): Promise<MiReporteDto[]> {
    return this.ciudadanos.misReportes(req.ciudadano!.idCuenta);
  }
}
