import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Publico } from '../auth/roles';
import { Actividad, Municipio, RangoEdad, Riesgo } from './catalogo.entities';
import { ESTATUS_ORDENADOS } from '../reportes/estatus';

/** Catálogos para llenar los chips del formulario (RNF-36). */
export interface CatalogosDto {
  actividades: string[];
  rangosEdad: string[];
  riesgos: string[];
  /** Estatus canónicos en orden (D-11). */
  estatus: string[];
}

/** Actividad del selector (Fase 2). */
export interface ActividadDto {
  nombre: string;
  /** true para "Otro": el formulario pide describir la actividad. */
  requiereDetalle: boolean;
}

/** Municipio del selector del formulario (D-16). */
export interface MunicipioDto {
  /** `id` que se envía en `municipioId`. */
  id: number;
  /** Clave geoestadística de INEGI (`15xxx`). */
  clave: string | null;
  nombre: string;
}

/** Orden alfabético en español (acentos y ñ correctos). */
const alfabetico = new Intl.Collator('es', { sensitivity: 'base' });

/** Catálogos públicos (`/api/v1/catalogos`): no contienen datos personales. */
@Controller('catalogos')
export class CatalogosController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Devuelve los catálogos del formulario de una sola vez. */
  @Publico()
  @Get()
  async todos(): Promise<CatalogosDto> {
    const nombres = async (e: typeof RangoEdad | typeof Riesgo) =>
      (await this.ds.getRepository(e).find({ order: { id: 'ASC' } })).map((x) => x.nombre);
    const [actividades, rangosEdad, riesgos] = await Promise.all([this.actividadesOrdenadas(), nombres(RangoEdad), nombres(Riesgo)]);
    return { actividades: actividades.map((a) => a.nombre), rangosEdad, riesgos, estatus: [...ESTATUS_ORDENADOS] };
  }

  /** Catálogo de actividades en el orden del selector ("Otro" al final). La app lo usa con respaldo local. */
  @Publico()
  @Get('actividades')
  async actividades(): Promise<ActividadDto[]> {
    return this.actividadesOrdenadas();
  }

  private async actividadesOrdenadas(): Promise<ActividadDto[]> {
    const filas = await this.ds.getRepository(Actividad).find({ order: { orden: 'ASC', id: 'ASC' } });
    return filas.map((a) => ({ nombre: a.nombre, requiereDetalle: a.nombre === 'Otro' }));
  }

  /** Municipios activos (los 125 del Estado de México), en orden alfabético. */
  @Publico()
  @Get('municipios')
  async municipios(): Promise<MunicipioDto[]> {
    const filas = await this.ds.getRepository(Municipio).find({ where: { activo: true } });
    return filas
      .map((m) => ({ id: m.id, clave: m.claveInegi, nombre: m.nombre }))
      .sort((a, b) => alfabetico.compare(a.nombre, b.nombre));
  }
}
