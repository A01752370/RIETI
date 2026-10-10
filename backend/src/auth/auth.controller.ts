import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { DESCRIPCION_PERMISO, GRUPO_A_PERFIL, Permiso, permisosDe, Publico, Requiere } from './roles';
import { RequestAutenticado } from './jwt.guard';

/** Perfil y permisos del personal autenticado (D-18). */
export interface PerfilDto {
  correo: string;
  /** "Administrador" o "Enlace municipal". */
  perfil: string;
  grupos: string[];
  permisos: { permiso: Permiso; descripcion: string }[];
}
import { LoginDto, LoginRespuestaDto } from './auth.dto';

/** Inicio de sesión del personal SIPINNA (`/api/v1/auth`). */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Login contra Cognito. Pública por definición; límite estricto contra
   * fuerza bruta: 5 intentos por minuto por IP (además del bloqueo de Cognito).
   */
  @Publico()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<LoginRespuestaDto> {
    return this.auth.login(dto);
  }

  /** Perfil y permisos de quien hace la petición, según la matriz de `roles.ts`. */
  @Requiere('perfil.ver')
  @Get('perfil')
  async perfil(@Req() req: RequestAutenticado): Promise<PerfilDto> {
    const { sub, grupos } = req.usuario!;
    const usuario = await this.auth.buscarPorSub(sub);
    const principal = grupos.includes('Administrador') ? 'Administrador' : 'PersonalSIPINNA';
    return {
      correo: usuario?.correo ?? '',
      perfil: GRUPO_A_PERFIL[principal],
      grupos,
      permisos: permisosDe(grupos).map((p) => ({ permiso: p, descripcion: DESCRIPCION_PERMISO[p] })),
    };
  }
}
