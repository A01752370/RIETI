import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Liveness para el ALB. No consulta la BD a propósito: si RDS falla, ECS no
   * debe reciclar contenedores sanos en bucle.
   */
  @Get()
  vivo() {
    return { estado: 'ok' };
  }

  /** Readiness: comprueba la conexión a PostgreSQL. */
  @Get('ready')
  async listo() {
    try {
      await this.ds.query('SELECT 1');
      return { estado: 'ok', bd: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ estado: 'error', bd: 'sin conexión' });
    }
  }
}
