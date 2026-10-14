import { Module } from '@nestjs/common';
import { CuentaCiudadanoController, CuentasPublicasController } from './ciudadanos.controller';
import { CiudadanosService } from './ciudadanos.service';
import { CuentasCognito, PROVEEDOR_CUENTAS } from './proveedor-cuentas';

/** Cuentas opcionales de ciudadano (Fase 4, D-19). */
@Module({
  controllers: [CuentasPublicasController, CuentaCiudadanoController],
  providers: [CiudadanosService, { provide: PROVEEDOR_CUENTAS, useClass: CuentasCognito }],
})
export class CiudadanosModule {}
