import { BadRequestException, ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CiudadanosService } from '../src/ciudadanos/ciudadanos.service';
import { ErrorCuenta, ProveedorCuentas } from '../src/ciudadanos/proveedor-cuentas';

/** Doble de Cognito: cada operación se puede configurar para fallar con un código. */
function proveedor(fallas: Partial<Record<keyof ProveedorCuentas, ErrorCuenta['codigo']>> = {}): ProveedorCuentas & { llamadas: string[] } {
  const llamadas: string[] = [];
  const op = <T>(nombre: keyof ProveedorCuentas, valor: T) => async () => {
    llamadas.push(nombre);
    if (fallas[nombre]) throw new ErrorCuenta(fallas[nombre]!);
    return valor;
  };
  return {
    llamadas,
    registrar: op('registrar', undefined), confirmar: op('confirmar', undefined), reenviarCodigo: op('reenviarCodigo', undefined),
    iniciarSesion: op('iniciarSesion', { accessToken: 'a', refreshToken: 'r', expiresIn: 3600 }),
    refrescar: op('refrescar', { accessToken: 'b', expiresIn: 3600 }), olvideContrasena: op('olvideContrasena', undefined),
    restablecerContrasena: op('restablecerContrasena', undefined), cambiarContrasena: op('cambiarContrasena', undefined),
    cerrarSesionGlobal: op('cerrarSesionGlobal', undefined), eliminar: op('eliminar', undefined), correo: op('correo', 'a@ejemplo.mx'),
  };
}

/** DataSource mínimo que registra las consultas de la transacción. */
function bd() {
  const consultas: string[] = [];
  const m = { query: async (sql: string) => { consultas.push(sql.trim().split(/\s+/).slice(0, 3).join(' ')); return []; } };
  return { consultas, ds: { transaction: async (fn: (x: typeof m) => Promise<void>) => fn(m), query: m.query } as unknown as DataSource };
}

const servicio = (p: ProveedorCuentas) => new CiudadanosService(p, bd().ds);

describe('cuentas de ciudadano (servicio)', () => {
  it('A32: el registro responde igual si el correo ya existía', async () => {
    const nuevo = await servicio(proveedor()).registrar('a@ejemplo.mx', 'Contrasena123');
    const existente = await servicio(proveedor({ registrar: 'YA_EXISTE' })).registrar('a@ejemplo.mx', 'Contrasena123');
    expect(existente).toEqual(nuevo);
  });

  it('A32: reenviar código y olvidé contraseña responden igual exista o no la cuenta', async () => {
    expect(await servicio(proveedor({ reenviarCodigo: 'CREDENCIALES' })).reenviarCodigo('x@ejemplo.mx'))
      .toEqual(await servicio(proveedor()).reenviarCodigo('x@ejemplo.mx'));
    expect(await servicio(proveedor({ olvideContrasena: 'CREDENCIALES' })).olvideContrasena('x@ejemplo.mx'))
      .toEqual(await servicio(proveedor()).olvideContrasena('x@ejemplo.mx'));
  });

  it('confirmar con un correo sin cuenta responde como código incorrecto', async () => {
    await expect(servicio(proveedor({ confirmar: 'CREDENCIALES' })).confirmar('x@ejemplo.mx', '123456')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('login: credenciales → 401; cuenta sin activar → 403; demasiados intentos → 429', async () => {
    await expect(servicio(proveedor({ iniciarSesion: 'CREDENCIALES' })).iniciarSesion('a@ejemplo.mx', 'x')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(servicio(proveedor({ iniciarSesion: 'NO_CONFIRMADA' })).iniciarSesion('a@ejemplo.mx', 'x')).rejects.toBeInstanceOf(ForbiddenException);
    const e = await servicio(proveedor({ iniciarSesion: 'DEMASIADOS_INTENTOS' })).iniciarSesion('a@ejemplo.mx', 'x').catch((x) => x);
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getStatus()).toBe(429);
  });

  it('eliminar: desvincula y borra la fila local antes de borrar el usuario en Cognito', async () => {
    const p = proveedor();
    const { ds, consultas } = bd();
    await new CiudadanosService(p, ds).eliminar('token', 7);
    expect(consultas).toEqual(['UPDATE reporte SET', 'DELETE FROM cuentas_ciudadano']);
    expect(p.llamadas).toEqual(['eliminar']);
  });
});
