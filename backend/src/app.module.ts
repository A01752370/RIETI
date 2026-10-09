import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { opcionesTypeOrm } from './config/typeorm.config';
import { AuthModule } from './auth/auth.module';
import { crearVerificadorCognito, JwtGuard, VERIFICADOR_JWT } from './auth/jwt.guard';
import { HealthController } from './health/health.controller';
import { AvisosController } from './avisos/aviso-privacidad';
import { CatalogosController } from './catalogos/catalogos.controller';
import { ReportesModule } from './reportes/reportes.module';

/**
 * Módulo raíz. El orden de los guards globales importa: primero el límite de
 * tasa (barato) y luego la autenticación, que deniega por defecto.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({ useFactory: opcionesTypeOrm }),
    // Límite general por IP; las rutas sensibles lo endurecen con @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    ReportesModule,
  ],
  controllers: [HealthController, AvisosController, CatalogosController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: VERIFICADOR_JWT, useFactory: crearVerificadorCognito },
    { provide: APP_GUARD, useClass: JwtGuard },
  ],
})
export class AppModule {}
