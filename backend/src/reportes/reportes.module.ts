import { Module } from '@nestjs/common';
import { ALMACEN_FOTOS, crearAlmacen } from '../fotos/almacen';
import { FotosController, FotosService } from '../fotos/fotos';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

/** Reportes ciudadanos, consulta pública, bandeja del personal y fotos (Fase 8). */
@Module({
  controllers: [FotosController, ReportesController],
  providers: [ReportesService, FotosService, { provide: ALMACEN_FOTOS, useFactory: crearAlmacen }],
})
export class ReportesModule {}
