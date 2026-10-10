import { Transform, Type } from 'class-transformer';
import {
  Equals, IsIn, IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator';
import { AVISO_PRIVACIDAD_VERSION } from '../avisos/aviso-privacidad';
import { ESTATUS_ORDENADOS } from './estatus';

/** Quita espacios al inicio y al final de los textos recibidos. */
const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Cuerpo de `POST /api/v1/reportes` (CU-04, reporte anónimo).
 *
 * `ValidationPipe` corre con `whitelist` + `forbidNonWhitelisted`: cualquier
 * campo que no esté aquí (p. ej. un identificador de dispositivo) se rechaza.
 */
export class CrearReporteDto {
  /** Referencia del lugar de los hechos (calle, colonia, referencia). */
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  ubicacion: string;

  /** Latitud del lugar de los hechos (opcional). No es la ubicación de quien reporta. */
  @IsOptional()
  @IsLatitude()
  latitud?: number | null;

  /** Longitud del lugar de los hechos (opcional). */
  @IsOptional()
  @IsLongitude()
  longitud?: number | null;

  /** Cantidad aproximada de niñas, niños o adolescentes observados (RF-05). */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  cantidadNinos: number;

  /** Rango de edad (catálogo `rango_edad`). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  edadAproximada: string;

  /** Actividad observada (catálogo `actividad`). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  actividad: string;

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

/** Filtros y paginación de la bandeja (`GET /api/v1/reportes`). */
export class ListarReportesDto {
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
