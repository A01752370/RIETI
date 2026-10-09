import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Publico } from '../auth/roles';
import { Actividad, RangoEdad, Riesgo } from './catalogo.entities';
import { ESTATUS_ORDENADOS } from '../reportes/estatus';

/** Catálogos para llenar los chips del formulario (RNF-36). */
export interface CatalogosDto {
  actividades: string[];
  rangosEdad: string[];
  riesgos: string[];
  /** Estatus canónicos en orden (D-11). */
  estatus: string[];
}

/** Catálogos públicos (`/api/v1/catalogos`): no contienen datos personales. */
@Controller('catalogos')
export class CatalogosController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Devuelve todos los catálogos del formulario de una sola vez. */
  @Publico()
  @Get()
  async todos(): Promise<CatalogosDto> {
    const nombres = async (e: typeof Actividad | typeof RangoEdad | typeof Riesgo, orden: string) =>
      (await this.ds.getRepository(e).find({ order: { [orden]: 'ASC' } })).map((x) => x.nombre);
    const [actividades, rangosEdad, riesgos] = await Promise.all([
      nombres(Actividad, 'id'), nombres(RangoEdad, 'id'), nombres(Riesgo, 'id'),
    ]);
    return { actividades, rangosEdad, riesgos, estatus: [...ESTATUS_ORDENADOS] };
  }
}
