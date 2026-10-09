import { Type } from 'class-transformer';
import {
  IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

/** Cuerpo de `POST /reportes` (CrearReporteRequest en la app). */
export class CrearReporteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  ubicacion: string;

  @IsOptional()
  @IsLatitude()
  latitud?: number | null;

  @IsOptional()
  @IsLongitude()
  longitud?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  cantidadNinos: number;

  @IsString()
  @IsNotEmpty()
  edadAproximada: string;

  @IsString()
  @IsNotEmpty()
  actividad: string;

  @IsString()
  @IsNotEmpty()
  situacionRiesgo: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  descripcion: string;
}

/** Cuerpo de `PATCH /reportes/:id` (ActualizarReporteRequest en la app). */
export class ActualizarReporteDto {
  @IsString()
  @IsNotEmpty()
  estatus: string;

  @IsString()
  @MaxLength(5000)
  comentarioAdmin: string;
}

/** DTO plano que consume la app (`Reporte.kt`). */
export interface ReporteRespuestaDto {
  id: number;
  folio: string;
  ubicacion: string;
  latitud: number | null;
  longitud: number | null;
  cantidadNinos: number;
  edadAproximada: string;
  actividad: string;
  situacionRiesgo: string;
  descripcion: string;
  estatus: string;
  comentarioAdmin: string | null;
  fechaCreacion: string;
  fechaActualizacion: string;
}
