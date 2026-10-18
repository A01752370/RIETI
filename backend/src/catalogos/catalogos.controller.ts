import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Publico } from '../auth/roles';
import { Actividad, Municipio, RangoEdad, Riesgo } from './catalogo.entities';
import { ESTATUS_ORDENADOS, ETIQUETAS } from '../reportes/estatus';
import { CANTIDADES, PELIGRO } from '../reportes/clasificacion';

/** Catálogos para llenar los chips del formulario (RNF-36). */
export interface CatalogosDto {
  actividades: string[];
  rangosEdad: string[];
  riesgos: string[];
  /** Estatus canónicos en orden (nombres internos; D-11). */
  estatus: string[];
  /** Estatus con su etiqueta pública del catálogo del socio (Fase 6). */
  estatusDetalle: { nombre: string; etiqueta: string }[];
  /** Respuestas a "¿Está en peligro inmediato?" (Fase 6). */
  peligro: string[];
  /** Categorías de "¿Cuántas viste?" (Fase 6). */
  cantidades: string[];
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
    const [actividades, rangos, riesgos] = await Promise.all([
      this.actividadesOrdenadas(),
      this.ds.getRepository(RangoEdad).find({ where: { vigente: true }, order: { orden: 'ASC' } }),
      this.ds.getRepository(Riesgo).find({ order: { id: 'ASC' } }),
    ]);
    return {
      actividades: actividades.map((a) => a.nombre),
      rangosEdad: rangos.map((r) => r.nombre),
      riesgos: riesgos.map((r) => r.nombre),
      estatus: [...ESTATUS_ORDENADOS],
      estatusDetalle: ESTATUS_ORDENADOS.map((e) => ({ nombre: e, etiqueta: ETIQUETAS[e] })),
      peligro: [...PELIGRO],
      cantidades: [...CANTIDADES],
    };
  }

  /** Catálogo de actividades en el orden del selector ("Otro" al final). La app lo usa con respaldo local. */
  @Publico()
  @Get('actividades')
  async actividades(): Promise<ActividadDto[]> {
    return this.actividadesOrdenadas();
  }

  private async actividadesOrdenadas(): Promise<ActividadDto[]> {
    // Solo las vigentes (Fase 6); las heredadas siguen siendo válidas al recibir reportes anteriores.
    const filas = await this.ds.getRepository(Actividad).find({ where: { vigente: true }, order: { orden: 'ASC', id: 'ASC' } });
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
