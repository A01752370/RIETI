import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { opcionesTypeOrm } from './config/typeorm.config';
import { AuthModule } from './auth/auth.module';
import { JwtGuard } from './auth/jwt.guard';
import { HealthController } from './health/health.controller';
import { ReportesModule } from './reportes/reportes.module';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({ useFactory: opcionesTypeOrm }),
    // Límite general por IP; las rutas sensibles lo endurecen con @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    ReportesModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtGuard },
  ],
})
export class AppModule {}
