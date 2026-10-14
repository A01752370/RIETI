import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { lineaDeTiempoPublica } from '../reportes/reportes.service';
import { CuentaDto, MensajeDto, MiReporteDto, SesionCiudadanoDto } from './ciudadanos.dto';
import { ErrorCuenta, PROVEEDOR_CUENTAS, ProveedorCuentas } from './proveedor-cuentas';

/** Mensajes uniformes: no revelan si un correo tiene cuenta (enumeración, ataque A32). */
const MSJ_REGISTRO = 'Si el correo es válido, te enviamos un código de 6 dígitos para activar tu cuenta.';
const MSJ_RECUPERACION = 'Si existe una cuenta con ese correo, te enviamos un código para restablecer tu contraseña.';

/**
 * Cuentas opcionales de ciudadano (Fase 4, D-19), mediadas por el API: la app no
 * lleva el SDK de AWS ni habla con Cognito. RIETI solo guarda el `sub` de la
 * cuenta y sus fechas; el correo vive en Cognito.
 */
@Injectable()
export class CiudadanosService {
  constructor(
    @Inject(PROVEEDOR_CUENTAS) private readonly cuentas: ProveedorCuentas,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /** Traduce los errores esperables de Cognito al formato del API. */
  private traducir(e: unknown): never {
    if (!(e instanceof ErrorCuenta)) throw e;
    switch (e.codigo) {
      case 'CREDENCIALES': throw new UnauthorizedException({ codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos' });
      case 'NO_CONFIRMADA': throw new ForbiddenException({ codigo: 'CUENTA_NO_CONFIRMADA', mensaje: 'Activa tu cuenta con el código que enviamos a tu correo' });
      case 'CODIGO_INVALIDO': throw new BadRequestException({ codigo: 'CODIGO_INVALIDO', mensaje: 'El código no es correcto' });
      case 'CODIGO_VENCIDO': throw new BadRequestException({ codigo: 'CODIGO_VENCIDO', mensaje: 'El código venció. Pide uno nuevo' });
      case 'CONTRASENA_DEBIL':
        throw new BadRequestException({ codigo: 'CONTRASENA_DEBIL', mensaje: 'Usa al menos 12 caracteres con mayúsculas, minúsculas y números' });
      case 'DEMASIADOS_INTENTOS':
        throw new HttpException({ codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos. Espera unos minutos' }, HttpStatus.TOO_MANY_REQUESTS);
      default: throw new BadRequestException({ codigo: 'SOLICITUD_INVALIDA', mensaje: 'No se pudo completar la solicitud' });
    }
  }

  /** Registro. Misma respuesta si el correo ya tenía cuenta (no se revela). */
  async registrar(correo: string, password: string): Promise<MensajeDto> {
    try {
      await this.cuentas.registrar(correo, password);
    } catch (e) {
      if (!(e instanceof ErrorCuenta && e.codigo === 'YA_EXISTE')) this.traducir(e);
    }
    return { mensaje: MSJ_REGISTRO };
  }

  async confirmar(correo: string, codigo: string): Promise<MensajeDto> {
    try {
      await this.cuentas.confirmar(correo, codigo);
    } catch (e) {
      // Un correo sin cuenta responde igual que un código incorrecto.
      if (e instanceof ErrorCuenta && e.codigo === 'CREDENCIALES') this.traducir(new ErrorCuenta('CODIGO_INVALIDO'));
      this.traducir(e);
    }
    return { mensaje: 'Tu cuenta está activa. Ya puedes iniciar sesión.' };
  }

  async reenviarCodigo(correo: string): Promise<MensajeDto> {
    try {
      await this.cuentas.reenviarCodigo(correo);
    } catch (e) {
      if (e instanceof ErrorCuenta && e.codigo === 'DEMASIADOS_INTENTOS') this.traducir(e);
      // Cualquier otro caso (cuenta inexistente o ya confirmada) responde igual.
    }
    return { mensaje: MSJ_REGISTRO };
  }

  async iniciarSesion(correo: string, password: string): Promise<SesionCiudadanoDto> {
    try {
      return await this.cuentas.iniciarSesion(correo, password);
    } catch (e) {
      this.traducir(e);
    }
  }

  async refrescar(refreshToken: string): Promise<SesionCiudadanoDto> {
    try {
      return await this.cuentas.refrescar(refreshToken);
    } catch (e) {
      if (e instanceof ErrorCuenta && e.codigo === 'CREDENCIALES') {
        throw new UnauthorizedException({ codigo: 'SESION_EXPIRADA', mensaje: 'Tu sesión venció. Vuelve a iniciar sesión' });
      }
      this.traducir(e);
    }
  }

  async olvideContrasena(correo: string): Promise<MensajeDto> {
    try {
      await this.cuentas.olvideContrasena(correo);
    } catch (e) {
      if (e instanceof ErrorCuenta && e.codigo === 'DEMASIADOS_INTENTOS') this.traducir(e);
    }
    return { mensaje: MSJ_RECUPERACION };
  }

  async restablecerContrasena(correo: string, codigo: string, password: string): Promise<MensajeDto> {
    try {
      await this.cuentas.restablecerContrasena(correo, codigo, password);
    } catch (e) {
      if (e instanceof ErrorCuenta && e.codigo === 'CREDENCIALES') this.traducir(new ErrorCuenta('CODIGO_INVALIDO'));
      this.traducir(e);
    }
    return { mensaje: 'Tu contraseña se cambió. Ya puedes iniciar sesión.' };
  }

  /** Perfil: correo (de Cognito), fecha de alta y número de reportes vinculados. */
  async cuenta(accessToken: string, idCuenta: number): Promise<CuentaDto> {
    let correo: string;
    try {
      correo = await this.cuentas.correo(accessToken);
    } catch (e) {
      this.traducir(e);
    }
    const [fila] = await this.ds.query(
      `SELECT c.fecha_creacion, (SELECT count(*)::int FROM reporte r WHERE r.cuenta_ciudadano_id = c.id_cuenta) AS reportes
       FROM cuentas_ciudadano c WHERE c.id_cuenta = $1`, [idCuenta]);
    return { correo, fechaCreacion: new Date(fila.fecha_creacion).toISOString(), reportesVinculados: fila.reportes };
  }

  async cambiarContrasena(accessToken: string, actual: string, nueva: string): Promise<MensajeDto> {
    try {
      await this.cuentas.cambiarContrasena(accessToken, actual, nueva);
    } catch (e) {
      if (e instanceof ErrorCuenta && e.codigo === 'CREDENCIALES') {
        throw new BadRequestException({ codigo: 'CONTRASENA_ACTUAL_INCORRECTA', mensaje: 'La contraseña actual no es correcta' });
      }
      this.traducir(e);
    }
    return { mensaje: 'Tu contraseña se cambió.' };
  }

  /** Cierra la sesión en todos los dispositivos (revoca los refresh tokens). */
  async cerrarSesion(accessToken: string): Promise<MensajeDto> {
    try {
      await this.cuentas.cerrarSesionGlobal(accessToken);
    } catch (e) {
      this.traducir(e);
    }
    return { mensaje: 'Cerraste sesión.' };
  }

  /**
   * Elimina la cuenta: primero se desvinculan sus reportes y se borra la fila
   * local (los reportes se conservan para su atención, sin vínculo con la
   * persona) y después el usuario de Cognito.
   */
  async eliminar(accessToken: string, idCuenta: number): Promise<MensajeDto> {
    await this.ds.transaction(async (m) => {
      await m.query('UPDATE reporte SET cuenta_ciudadano_id = NULL WHERE cuenta_ciudadano_id = $1', [idCuenta]);
      await m.query('DELETE FROM cuentas_ciudadano WHERE id_cuenta = $1', [idCuenta]);
    });
    try {
      await this.cuentas.eliminar(accessToken);
    } catch (e) {
      this.traducir(e);
    }
    return { mensaje: 'Tu cuenta se eliminó. Tus reportes siguen en atención, ya sin vínculo contigo.' };
  }

  /** Reportes vinculados a la cuenta, con lo que muestra la consulta pública (sin notas internas). */
  async misReportes(idCuenta: number): Promise<MiReporteDto[]> {
    const filas: { id: number; folio: string; estatus: string; municipio: string | null; actividad: string; creado: Date; actualizado: Date }[] =
      await this.ds.query(
        `SELECT r.id_reporte AS id, f.codigo AS folio, e.nombre AS estatus, m.nombre AS municipio, a.nombre AS actividad,
                r.fecha_creacion AS creado, r.fecha_actualizacion AS actualizado
         FROM reporte r
         JOIN folio f ON f.id_reporte = r.id_reporte
         JOIN reporte_caso rc ON rc.id_reporte = r.id_reporte
         JOIN caso c ON c.id_caso = rc.id_caso
         JOIN estatus_reporte e ON e.id_estatus = c.id_estatus
         JOIN actividad a ON a.id_actividad = r.id_actividad
         LEFT JOIN municipio m ON m.id_municipio = r.id_municipio
         WHERE r.cuenta_ciudadano_id = $1
         ORDER BY r.fecha_creacion DESC
         LIMIT 100`, [idCuenta]);
    if (filas.length === 0) return [];
    const eventos: { id_reporte: number; estatus: string; fecha: Date }[] = await this.ds.query(
      `SELECT rc.id_reporte, e.nombre AS estatus, s.fecha
       FROM reporte_caso rc JOIN seguimiento s ON s.id_caso = rc.id_caso JOIN estatus_reporte e ON e.id_estatus = s.id_estatus
       WHERE rc.id_reporte = ANY($1) ORDER BY s.fecha, s.id_seguimiento`, [filas.map((f) => f.id)]);
    return filas.map((f) => ({
      folio: f.folio,
      estatus: f.estatus,
      municipio: f.municipio,
      actividad: f.actividad,
      fechaCreacion: new Date(f.creado).toISOString(),
      fechaActualizacion: new Date(f.actualizado).toISOString(),
      historial: lineaDeTiempoPublica(eventos.filter((e) => Number(e.id_reporte) === Number(f.id)).map((e) => ({ estatus: e.estatus, fecha: new Date(e.fecha) }))),
    }));
  }
}
