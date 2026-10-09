import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** Cuerpo de `POST /api/v1/auth/login` (personal SIPINNA). */
export class LoginDto {
  /** Correo con el que el administrador dio de alta la cuenta en Cognito. */
  @IsEmail()
  @MaxLength(254)
  correo: string;

  /** Contraseña; solo viaja a Cognito, la API nunca la guarda ni la registra. */
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password: string;
}

/** Respuesta de login. La app envía `accessToken` como `Authorization: Bearer`. */
export interface LoginRespuestaDto {
  /** `usuario.id_usuario`. */
  idUsuario: number;
  /** Correo normalizado en minúsculas. */
  correo: string;
  /** Nombre del rol (`rol_usuario.nombre`), p. ej. "Personal SIPINNA". */
  rol: string;
  /** true si el usuario pertenece al grupo de Cognito `Administrador`. */
  esAdministrador: boolean;
  /** Access token de Cognito (JWT). */
  accessToken: string;
  /** Segundos de validez del token. */
  expiresIn: number;
}

/** Datos del usuario autenticado que el guard deja en `request.usuario`. */
export interface UsuarioAutenticado {
  /** Identificador inmutable del usuario en Cognito. */
  sub: string;
  /** Grupos de Cognito (rol grueso). */
  grupos: string[];
  /** `usuario.id_usuario` en la base de datos. */
  idUsuario: number;
}
