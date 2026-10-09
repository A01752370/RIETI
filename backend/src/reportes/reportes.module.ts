import { Module } from '@nestjs/common';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

/** Reportes ciudadanos, consulta pública y bandeja del personal. */
@Module({
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
