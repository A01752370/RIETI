import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  correo: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password: string;
}

/** Respuesta de login. Los campos de token son nuevos; la app los usa en `Authorization: Bearer`. */
export interface LoginRespuestaDto {
  idUsuario: number;
  correo: string;
  rol: string;
  esAdministrador: boolean;
  accessToken: string;
  expiresIn: number;
}

/** Datos del usuario autenticado que el guard deja en `request.usuario`. */
export interface UsuarioAutenticado {
  sub: string;
  grupos: string[];
}
