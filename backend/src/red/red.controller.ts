import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Put } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, isEmail, isURL, MaxLength, ValidateNested } from 'class-validator';
import { DataSource } from 'typeorm';
import { Publico, Requiere } from '../auth/roles';
import { ContactoMunicipio, Municipio } from '../catalogos/catalogo.entities';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Un contacto institucional en el cuerpo de `PUT /red-municipios/:id`. */
export class ContactoDto {
  /** `correo` o `enlace`. */
  @IsIn(['correo', 'enlace'])
  tipo: 'correo' | 'enlace';

  /** Correo institucional o URL `https://`. */
  @Transform(recortar)
  @IsString()
  @MaxLength(300)
  valor: string;

  /** Texto opcional, p. ej. "Enlace municipal". */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(120)
  etiqueta?: string;
}

/** Cuerpo de `PUT /api/v1/red-municipios/:municipioId`: reemplaza la lista completa. */
export class ReemplazarContactosDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ContactoDto)
  contactos: ContactoDto[];
}

/** Contacto tal como se publica. */
export interface ContactoPublicoDto {
  tipo: 'correo' | 'enlace';
  valor: string;
  etiqueta: string | null;
  /** true si es un dato de ejemplo (dominio example.org), no oficial. */
  esEjemplo: boolean;
}

/** Municipio de la red con sus contactos. */
export interface MunicipioRedDto {
  id: number;
  clave: string | null;
  nombre: string;
  contactos: ContactoPublicoDto[];
}

/** Respuesta de `GET /api/v1/red-municipios`. */
export interface RedMunicipiosDto {
  /** Mientras sea true, la web debe mostrar el aviso de "Datos de ejemplo". */
  hayDatosDeEjemplo: boolean;
  municipios: MunicipioRedDto[];
}

/**
 * Valida un contacto según su tipo. Es una función pura para probarla aparte.
 * @returns mensaje de error, o null si el contacto es válido
 */
export function validarContacto(c: ContactoDto): string | null {
  if (c.tipo === 'correo' && !isEmail(c.valor)) return `"${c.valor}" no es un correo válido`;
  if (c.tipo === 'enlace' && !isURL(c.valor, { protocols: ['https'], require_protocol: true })) {
    return `"${c.valor}" debe ser un enlace que empiece con https://`;
  }
  return null;
}

/**
 * Directorio de la red de municipios (D-17). Consulta pública; solo el
 * administrador edita. Cambiar los contactos de ejemplo por los oficiales es
 * cargar datos con este endpoint, no cambiar código.
 */
@Controller('red-municipios')
export class RedController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Municipios que tienen al menos un contacto, en orden alfabético. */
  @Publico()
  @Get()
  async listar(): Promise<RedMunicipiosDto> {
    const contactos = await this.ds.getRepository(ContactoMunicipio).find({
      relations: { municipio: true }, order: { id: 'ASC' },
    });
    const porMunicipio = new Map<number, MunicipioRedDto>();
    for (const c of contactos) {
      const m = porMunicipio.get(c.municipio.id)
        ?? { id: c.municipio.id, clave: c.municipio.claveInegi, nombre: c.municipio.nombre, contactos: [] };
      m.contactos.push({ tipo: c.tipo, valor: c.valor, etiqueta: c.etiqueta, esEjemplo: c.esEjemplo });
      porMunicipio.set(m.id, m);
    }
    const alfabetico = new Intl.Collator('es', { sensitivity: 'base' });
    return {
      hayDatosDeEjemplo: contactos.some((c) => c.esEjemplo),
      municipios: [...porMunicipio.values()].sort((a, b) => alfabetico.compare(a.nombre, b.nombre)),
    };
  }

  /**
   * Reemplaza los contactos de un municipio (solo administrador). Los contactos
   * guardados por aquí ya no son de ejemplo.
   */
  @Requiere('red.editar')
  @Put(':municipioId')
  async reemplazar(
    @Param('municipioId', ParseIntPipe) municipioId: number,
    @Body() dto: ReemplazarContactosDto,
  ): Promise<RedMunicipiosDto> {
    const errores = dto.contactos.map(validarContacto).filter((e): e is string => e !== null);
    if (errores.length > 0) {
      throw new BadRequestException({ codigo: 'CONTACTO_INVALIDO', mensaje: 'Hay contactos inválidos', detalle: errores });
    }
    await this.ds.transaction(async (m) => {
      const municipio = await m.findOneBy(Municipio, { id: municipioId });
      if (!municipio) throw new NotFoundException('Municipio no encontrado');
      await m.delete(ContactoMunicipio, { municipio: { id: municipioId } });
      for (const c of dto.contactos) {
        await m.save(m.create(ContactoMunicipio, {
          municipio, tipo: c.tipo, valor: c.valor, etiqueta: c.etiqueta ?? null, esEjemplo: false,
        }));
      }
    });
    return this.listar();
  }
}
