import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { convertirError } from '../src/comun/filtro-errores';

describe('formato único de errores {codigo, mensaje, detalle?}', () => {
  it('errores de validación → SOLICITUD_INVALIDA con detalle', () => {
    const { estatus, cuerpo } = convertirError(new BadRequestException(['folio debe ser texto', 'clave es obligatoria']));
    expect(estatus).toBe(400);
    expect(cuerpo).toEqual({
      codigo: 'SOLICITUD_INVALIDA',
      mensaje: 'Hay datos inválidos en la solicitud',
      detalle: ['folio debe ser texto', 'clave es obligatoria'],
    });
  });

  it('respeta código y mensaje propios', () => {
    const { cuerpo } = convertirError(new ForbiddenException({ codigo: 'SIN_ROL', mensaje: 'Sin rol' }));
    expect(cuerpo).toEqual({ codigo: 'SIN_ROL', mensaje: 'Sin rol' });
  });

  it('conserva el mensaje en español de la excepción', () => {
    expect(convertirError(new NotFoundException('Reporte no encontrado')).cuerpo)
      .toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'Reporte no encontrado' });
  });

  it('sustituye la frase genérica en inglés', () => {
    expect(convertirError(new UnauthorizedException()).cuerpo)
      .toEqual({ codigo: 'NO_AUTENTICADO', mensaje: 'Inicia sesión para continuar' });
    expect(convertirError(new ThrottlerException()).cuerpo.codigo).toBe('DEMASIADOS_INTENTOS');
  });

  it('nunca expone detalles de errores internos', () => {
    const { estatus, cuerpo } = convertirError(new Error('password=secreto en la cadena de conexión'));
    expect(estatus).toBe(500);
    expect(JSON.stringify(cuerpo)).not.toContain('secreto');
    expect(cuerpo.codigo).toBe('ERROR_INTERNO');
  });
});

describe('errores de body-parser', () => {
  it('cuerpo demasiado grande → 413 CUERPO_DEMASIADO_GRANDE', () => {
    const err = Object.assign(new Error('request entity too large'), { status: 413, expose: true, type: 'entity.too.large' });
    expect(convertirError(err)).toEqual({
      estatus: 413, cuerpo: { codigo: 'CUERPO_DEMASIADO_GRANDE', mensaje: 'La solicitud es demasiado grande' },
    });
  });

  it('JSON mal formado → 400 sin eco del cuerpo', () => {
    const err = Object.assign(new SyntaxError('Unexpected token } in JSON'), { status: 400, expose: true, type: 'entity.parse.failed' });
    const { estatus, cuerpo } = convertirError(err);
    expect(estatus).toBe(400);
    expect(cuerpo.codigo).toBe('SOLICITUD_INVALIDA');
  });
});

describe('rutas inexistentes', () => {
  it('no devuelve el texto en inglés de Express', () => {
    const { NotFoundException } = require('@nestjs/common');
    expect(convertirError(new NotFoundException('Cannot GET /api/v1/no-existe')).cuerpo)
      .toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'No se encontró el recurso' });
  });
});
