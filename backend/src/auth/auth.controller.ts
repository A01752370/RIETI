import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Publico } from './roles';
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
}
