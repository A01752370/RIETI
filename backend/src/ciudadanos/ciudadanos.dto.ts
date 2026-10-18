import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Correo normalizado (sin espacios, en minúsculas). */
const normalizarCorreo = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** Política mínima de contraseña (Cognito aplica además la suya: mayúscula, minúscula y número). */
const MIN_CONTRASENA = 12;

/** Cuerpo con solo el correo. */
export class CorreoDto {
  @Transform(normalizarCorreo)
  @IsEmail({}, { message: 'Escribe un correo válido' })
  @MaxLength(254)
  correo: string;
}

/** Registro e inicio de sesión. */
export class CredencialesDto extends CorreoDto {
  @IsString()
  @MinLength(MIN_CONTRASENA, { message: `La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres` })
  @MaxLength(256)
  password: string;
}

/** Confirmación del registro con el código enviado al correo. */
export class ConfirmarDto extends CorreoDto {
  @Matches(/^\d{6}$/, { message: 'El código tiene 6 dígitos' })
  codigo: string;
}

/** Restablecer contraseña con el código enviado al correo. */
export class RestablecerDto extends ConfirmarDto {
  @IsString()
  @MinLength(MIN_CONTRASENA, { message: `La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres` })
  @MaxLength(256)
  password: string;
}

/** Renovar la sesión. */
export class RefrescarDto {
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  refreshToken: string;
}

/** Cambio de contraseña con la sesión abierta. */
export class CambiarContrasenaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  actual: string;

  @IsString()
  @MinLength(MIN_CONTRASENA, { message: `La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres` })
  @MaxLength(256)
  nueva: string;
}

/** Respuesta genérica (misma respuesta exista o no la cuenta, contra la enumeración). */
export interface MensajeDto {
  mensaje: string;
}

/** Sesión de ciudadano. */
export interface SesionCiudadanoDto {
  accessToken: string;
  /** Solo al iniciar sesión; la app lo guarda cifrado. */
  refreshToken?: string;
  expiresIn: number;
}

/** Perfil de la cuenta (el correo se lee de Cognito; RIETI no lo guarda). */
export interface CuentaDto {
  correo: string;
  fechaCreacion: string;
  reportesVinculados: number;
}

/** Reporte vinculado a la cuenta, con lo mismo que ve la consulta pública. */
export interface MiReporteDto {
  folio: string;
  estatus: string;
  /** Etiqueta pública del estatus (Fase 6). */
  estatusEtiqueta: string;
  municipio: string | null;
  actividad: string;
  fechaCreacion: string;
  fechaActualizacion: string;
  historial: { estatus: string; etiqueta: string; fecha: string }[];
}
