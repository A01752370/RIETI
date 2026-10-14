import { Module } from '@nestjs/common';
import { FUENTE_GEO, FuenteOsm } from './fuente-geo';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';

/** Geografía del formulario: geocodificación inversa, municipio por punto y teselas. */
@Module({
  controllers: [GeoController],
  providers: [GeoService, { provide: FUENTE_GEO, useClass: FuenteOsm }],
  exports: [GeoService],
})
export class GeoModule {}
