import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, Equals, IsArray, IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString,
  Matches, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { AVISO_PRIVACIDAD_VERSION } from '../avisos/aviso-privacidad';
import { ESTATUS_ORDENADOS } from './estatus';

/** Quita espacios al inicio y al final de los textos recibidos. */
const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Menores observados en un rango de edad (Fase 2). */
export class GrupoMenoresDto {
  /** Rango del catálogo `rango_edad` ("0-5", "6-11", "12-17" o "Sin determinar"). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  rango: string;

  /** Cuántos menores de ese rango (el total del reporte no puede pasar de 50). */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  cantidad: number;
}

/** Dirección estructurada del lugar de los hechos (Fase 2). Se autorrellena desde el mapa y es editable. */
export class DireccionDto {
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'Escribe la calle' })
  @MaxLength(120)
  calle: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(20)
  numeroExterior?: string;

  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'Escribe la colonia' })
  @MaxLength(120)
  colonia: string;

  /** 5 dígitos; además se valida que sea del Estado de México (50000–57999). */
  @Transform(recortar)
  @IsString()
  @Matches(/^\d{5}$/, { message: 'El código postal debe tener 5 dígitos' })
  codigoPostal: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(300)
  referencias?: string;
}

/**
 * Cuerpo de `POST /api/v1/reportes` (CU-04, reporte anónimo).
 *
 * `ValidationPipe` corre con `whitelist` + `forbidNonWhitelisted`: cualquier
 * campo que no esté aquí (p. ej. un identificador de dispositivo) se rechaza.
 *
 * Acepta dos formatos (las APK instaladas siguen usando el anterior):
 * - **Anterior:** `ubicacion` (texto), `cantidadNinos` y `edadAproximada`.
 * - **Nuevo (Fase 2):** `direccion` y `grupos`; `ubicacion`, `cantidadNinos` y
 *   `edadAproximada` se vuelven opcionales y el servidor los deriva.
 */
export class CrearReporteDto {
  /** Referencia del lugar de los hechos. Obligatoria si no se envía `direccion`. */
  @ValidateIf((o: CrearReporteDto) => o.direccion === undefined || o.ubicacion !== undefined)
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  ubicacion?: string;

  /** Dirección estructurada (formato nuevo). */
  @IsOptional()
  @ValidateNested()
  @Type(() => DireccionDto)
  direccion?: DireccionDto;

  /** Latitud del lugar de los hechos (opcional). No es la ubicación de quien reporta. */
  @IsOptional()
  @IsLatitude()
  latitud?: number | null;

  /** Longitud del lugar de los hechos (opcional). */
  @IsOptional()
  @IsLongitude()
  longitud?: number | null;

  /** Cantidad aproximada de menores (formato anterior; obligatoria si no se envían `grupos`). */
  @ValidateIf((o: CrearReporteDto) => o.grupos === undefined || o.cantidadNinos !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  cantidadNinos?: number;

  /** Rango de edad (formato anterior; obligatorio si no se envían `grupos`). */
  @ValidateIf((o: CrearReporteDto) => o.grupos === undefined || o.edadAproximada !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  edadAproximada?: string;

  /** Menores por grupo de edad (formato nuevo): de 1 a 4 grupos, sin repetir rango. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Indica al menos un grupo de edad' })
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => GrupoMenoresDto)
  grupos?: GrupoMenoresDto[];

  /** Actividad observada (catálogo `actividad`, `GET /catalogos/actividades`). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  actividad: string;

  /** Detalle cuando la actividad es "Otro" (obligatorio en el formato nuevo). */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(120)
  actividadOtro?: string;

  /** ¿Se percibe riesgo? (catálogo `riesgo`: Sí / No / No sé). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  situacionRiesgo: string;

  /** Descripción libre de lo observado. */
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  descripcion: string;

  /**
   * Municipio donde ocurre (D-16), `id` de `GET /catalogos/municipios`. Obligatorio
   * desde que la web y la app Android lo envían; se valida contra la base.
   */
  @Type(() => Number)
  @IsInt({ message: 'Elige el municipio donde ocurre' })
  @Min(1, { message: 'Elige el municipio donde ocurre' })
  municipioId: number;

  /**
   * Vincular este reporte a la cuenta de ciudadano (Fase 4). Solo surte efecto
   * con un token de ciudadano; por defecto el reporte es anónimo.
   */
  @IsOptional()
  @IsBoolean()
  vincularCuenta?: boolean;

  /** Versión del aviso de privacidad que la persona aceptó; debe ser la vigente. */
  @Equals(AVISO_PRIVACIDAD_VERSION, { message: 'Debes aceptar el aviso de privacidad vigente' })
  avisoPrivacidadVersion: string;
}

/** Respuesta de `POST /api/v1/reportes`. La clave solo se entrega esta vez. */
export interface ReporteCreadoDto {
  /** Folio público `RIETI-AAAA-NNNNNN`. */
  folio: string;
  /** Clave de consulta `XXXX-XXXX-XXXX`; no se puede recuperar después. */
  claveConsulta: string;
  /** Estatus inicial (Recibido). */
  estatus: string;
  /** Fecha de registro (ISO-8601). */
  fechaCreacion: string;
}

/** Cuerpo de `POST /api/v1/reportes/consulta`. Por POST para no dejar la clave en URLs ni logs. */
export class ConsultarReporteDto {
  /** Folio `RIETI-AAAA-NNNNNN` (se aceptan minúsculas). */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^RIETI-\d{4}-\d{6}$/, { message: 'El folio debe tener el formato RIETI-AAAA-NNNNNN' })
  folio: string;

  /** Clave de consulta; se aceptan minúsculas, espacios y guiones. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  clave: string;
}

/** Un evento de la línea de tiempo pública: solo estatus y fecha, sin comentarios internos. */
export interface EventoPublicoDto {
  /** Estatus alcanzado. */
  estatus: string;
  /** Fecha del cambio (ISO-8601). */
  fecha: string;
}

/** Respuesta de la consulta ciudadana: sin ubicación, descripción ni notas del personal (RF-38). */
export interface ConsultaPublicaDto {
  /** Folio consultado. */
  folio: string;
  /** Estatus vigente. */
  estatus: string;
  /** Fecha de registro (ISO-8601). */
  fechaCreacion: string;
  /** Fecha de la última actualización (ISO-8601). */
  fechaActualizacion: string;
  /** Cambios de estatus, del más antiguo al más reciente. */
  historial: EventoPublicoDto[];
}

/** Filtros de la bandeja y de la exportación (Fase 3). */
export class FiltrosBandejaDto {
  /** Filtra por estatus vigente. */
  @IsOptional()
  @IsIn(ESTATUS_ORDENADOS)
  estatus?: string;

  /** Filtra por municipio (`id` del catálogo). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  municipioId?: number;

  /** Filtra por actividad (nombre del catálogo). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  actividad?: string;

  /** Fecha inicial `AAAA-MM-DD` (hora de la Ciudad de México). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe tener el formato AAAA-MM-DD' })
  desde?: string;

  /** Fecha final `AAAA-MM-DD`, incluida. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe tener el formato AAAA-MM-DD' })
  hasta?: string;

  /** Búsqueda por folio: completo o una parte (p. ej. "000123"); solo letras, dígitos y guiones. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9-]{1,20}$/, { message: 'El folio solo puede tener letras, números y guiones' })
  folio?: string;

  /** Solo casos pendientes (Recibido o En revisión) sin cambios en más de N días. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  sinAtenderDias?: number;

  /** Orden por fecha de creación. */
  @IsOptional()
  @IsIn(['recientes', 'antiguos'])
  orden: 'recientes' | 'antiguos' = 'recientes';
}

/** Filtros y paginación de la bandeja (`GET /api/v1/reportes`). */
export class ListarReportesDto extends FiltrosBandejaDto {
  /** Página (desde 1). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina = 1;

  /** Elementos por página (máximo 100). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  tamano = 20;
}

/** Grupo de edad en la respuesta del personal. */
export interface GrupoMenoresRespuestaDto {
  rango: string;
  cantidad: number;
}

/** Dirección en la respuesta del personal (null si el reporte se creó con el formato anterior). */
export interface DireccionRespuestaDto {
  calle: string | null;
  numeroExterior: string | null;
  colonia: string | null;
  codigoPostal: string | null;
  referencias: string | null;
}

/** Fila de la bandeja del personal. */
export interface ReporteResumenDto {
  id: number;
  folio: string;
  estatus: string;
  ubicacion: string;
  /** Municipio donde ocurre, o null si el reporte no lo indicó. */
  municipio: string | null;
  actividad: string;
  edadAproximada: string;
  cantidadNinos: number;
  situacionRiesgo: string;
  fechaCreacion: string;
  fechaActualizacion: string;
}

/** Página de resultados de la bandeja. */
export interface PaginaDto<T> {
  elementos: T[];
  total: number;
  pagina: number;
  tamano: number;
}

/** Evento de la bitácora de seguimiento, visible solo para el personal. */
export interface EventoSeguimientoDto {
  estatus: string;
  comentario: string | null;
  /** Correo de quien registró el evento; null para el registro automático inicial. */
  autor: string | null;
  fecha: string;
}

/** Detalle de un reporte para el personal (`GET /api/v1/reportes/:id`). */
export interface ReporteDetalleDto extends ReporteResumenDto {
  latitud: number | null;
  longitud: number | null;
  descripcion: string;
  /** Menores por grupo de edad (los reportes anteriores tienen un solo grupo). */
  grupos: GrupoMenoresRespuestaDto[];
  /** Detalle de la actividad cuando es "Otro". */
  actividadOtro: string | null;
  /** Dirección estructurada, o null si el reporte solo trae el texto de `ubicacion`. */
  direccion: DireccionRespuestaDto | null;
  motivoDescarte: string | null;
  /** Bitácora completa, del evento más antiguo al más reciente. */
  historial: EventoSeguimientoDto[];
  /** Estatus a los que se puede cambiar desde el actual (máquina de estados). */
  transicionesPermitidas: string[];
}

/** Cuerpo de `PATCH /api/v1/reportes/:id/estatus`. */
export class CambiarEstatusDto {
  /** Estatus destino; debe ser una transición válida desde el actual. */
  @IsIn(ESTATUS_ORDENADOS)
  estatus: string;

  /** Comentario de seguimiento (obligatorio al reabrir un caso concluido). */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(2000)
  comentario?: string;

  /** Motivo de descarte (obligatorio si `estatus` es Descartado). */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

/** Cuerpo de `POST /api/v1/reportes/:id/seguimientos` (nota sin cambiar estatus). */
export class AgregarSeguimientoDto {
  /** Texto de la nota. */
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  comentario: string;
}
