import {
  componerUbicacion, esCodigoPostalEdomex, normalizarGrupos, rangoPrincipal, redondearCoordenada, totalMenores,
} from '../src/reportes/formulario';
import { BadRequestException } from '@nestjs/common';

/** Mensaje en español de la excepción que lanza fn (formato {codigo, mensaje} del API). */
function mensajeDe(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof BadRequestException) return (e.getResponse() as { mensaje: string }).mensaje;
    throw e;
  }
  throw new Error('no lanzó excepción');
}

describe('grupos de edad', () => {
  it('formato nuevo: 2 niños de 0-5 y 1 de 12-17', () => {
    const g = normalizarGrupos({ grupos: [{ rango: '0-5', cantidad: 2 }, { rango: '12-17', cantidad: 1 }] });
    expect(g).toEqual([{ rango: '0-5', cantidad: 2 }, { rango: '12-17', cantidad: 1 }]);
    expect(totalMenores(g)).toBe(3);
    expect(rangoPrincipal(g)).toBe('0-5');
  });

  it('formato anterior (APK instaladas): un solo grupo desde edadAproximada + cantidadNinos', () => {
    expect(normalizarGrupos({ edadAproximada: '6-11', cantidadNinos: 2 })).toEqual([{ rango: '6-11', cantidad: 2 }]);
  });

  it('si llegan ambos formatos, manda el nuevo', () => {
    expect(normalizarGrupos({ grupos: [{ rango: '12-17', cantidad: 4 }], edadAproximada: '0-5', cantidadNinos: 1 }))
      .toEqual([{ rango: '12-17', cantidad: 4 }]);
  });

  it('rechaza rangos repetidos', () => {
    expect(mensajeDe(() => normalizarGrupos({ grupos: [{ rango: '0-5', cantidad: 1 }, { rango: '0-5 ', cantidad: 2 }] })))
      .toContain('una sola vez');
  });

  it('rechaza más de 50 en total', () => {
    expect(mensajeDe(() => normalizarGrupos({ grupos: [{ rango: '0-5', cantidad: 30 }, { rango: '6-11', cantidad: 21 }] })))
      .toContain('50');
    expect(normalizarGrupos({ grupos: [{ rango: '0-5', cantidad: 30 }, { rango: '6-11', cantidad: 20 }] })).toHaveLength(2);
  });

  it('sin ningún formato pide los datos', () => {
    expect(mensajeDe(() => normalizarGrupos({}))).toContain('Indica cuántas');
    expect(mensajeDe(() => normalizarGrupos({ cantidadNinos: 2 }))).toContain('Indica cuántas');
  });

  it('rango principal: el grupo más grande; en empate, el más pequeño de edad', () => {
    expect(rangoPrincipal([{ rango: '12-17', cantidad: 3 }, { rango: '0-5', cantidad: 1 }])).toBe('12-17');
    expect(rangoPrincipal([{ rango: '12-17', cantidad: 2 }, { rango: '6-11', cantidad: 2 }])).toBe('6-11');
    expect(rangoPrincipal([{ rango: 'Sin determinar', cantidad: 2 }, { rango: '0-5', cantidad: 2 }])).toBe('0-5');
  });
});

describe('dirección', () => {
  it('compone el texto de ubicación', () => {
    expect(componerUbicacion({ calle: 'Av. López Mateos', numeroExterior: '12', colonia: 'Centro', codigoPostal: '52900', referencias: 'frente al mercado' }))
      .toBe('Av. López Mateos 12, Col. Centro, C.P. 52900. Ref.: frente al mercado');
    expect(componerUbicacion({ calle: 'Calle 5', colonia: 'Las Alamedas', codigoPostal: '52970' }))
      .toBe('Calle 5, Col. Las Alamedas, C.P. 52970');
  });

  it('no pasa de 300 caracteres', () => {
    const t = componerUbicacion({ calle: 'x'.repeat(120), colonia: 'y'.repeat(120), codigoPostal: '52900', referencias: 'z'.repeat(300) });
    expect(t.length).toBe(300);
  });

  it('código postal: 5 dígitos y del Estado de México (50000–57999)', () => {
    expect(esCodigoPostalEdomex('52900')).toBe(true);
    expect(esCodigoPostalEdomex('50000')).toBe(true);
    expect(esCodigoPostalEdomex('57999')).toBe(true);
    expect(esCodigoPostalEdomex('06000')).toBe(false); // CDMX
    expect(esCodigoPostalEdomex('5290')).toBe(false);
    expect(esCodigoPostalEdomex('5290a')).toBe(false);
  });
});

describe('coordenadas', () => {
  it('se redondean a 5 decimales', () => {
    expect(redondearCoordenada(19.5594123)).toBe(19.55941);
    expect(redondearCoordenada(-99.2512987)).toBe(-99.2513);
    expect(redondearCoordenada(null)).toBeNull();
    expect(redondearCoordenada(undefined)).toBeNull();
  });
});
