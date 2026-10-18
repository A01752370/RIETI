import { calcularPrioridad, categoriaCantidad, formatearFolio, normalizarRango, PATRON_FOLIO } from '../src/reportes/clasificacion';
import { normalizarGrupos } from '../src/reportes/formulario';
import { CLAVES_FOLIO } from '../src/database/datos/claves-folio-municipios';
import { MUNICIPIOS_EDOMEX } from '../src/database/datos/municipios-edomex';

describe('prioridad (Fase 6, provisional)', () => {
  it('Alta con peligro inmediato; Media con riesgo percibido; Normal en el resto', () => {
    expect(calcularPrioridad('Sí', 'No')).toBe('Alta');
    expect(calcularPrioridad('Sí', 'Sí')).toBe('Alta');
    expect(calcularPrioridad('No', 'Sí')).toBe('Media');
    expect(calcularPrioridad('No sé', 'No sé')).toBe('Normal');
    expect(calcularPrioridad(undefined, 'Sí')).toBe('Media'); // reporte de un cliente anterior
    expect(calcularPrioridad(null, 'No')).toBe('Normal');
  });
});

describe('cantidad (1 a 4, 5 o más, No sé)', () => {
  it('se deriva de los grupos cuando el cliente no la manda', () => {
    expect(categoriaCantidad(undefined, 3)).toBe('3');
    expect(categoriaCantidad(undefined, 7)).toBe('5+');
  });
  it('debe cuadrar con la suma de los grupos', () => {
    expect(categoriaCantidad('2', 2)).toBe('2');
    expect(categoriaCantidad('5+', 6)).toBe('5+');
    expect(categoriaCantidad('No sé', 1)).toBe('No sé');
    expect(() => categoriaCantidad('3', 2)).toThrow();
    expect(() => categoriaCantidad('5+', 4)).toThrow();
  });
});

describe('rangos de edad', () => {
  it('"No sé" es el mismo valor que "Sin determinar"', () => {
    expect(normalizarRango(' No sé ')).toBe('Sin determinar');
    expect(normalizarGrupos({ grupos: [{ rango: 'No sé', cantidad: 2 }, { rango: '12-14', cantidad: 1 }] }))
      .toEqual([{ rango: 'Sin determinar', cantidad: 2 }, { rango: '12-14', cantidad: 1 }]);
    expect(() => normalizarGrupos({ grupos: [{ rango: 'No sé', cantidad: 1 }, { rango: 'Sin determinar', cantidad: 1 }] })).toThrow();
  });
});

describe('folio con clave municipal', () => {
  it('formato nuevo y heredado; el patrón acepta ambos', () => {
    expect(formatearFolio(2026, 123, 'ATZ')).toBe('RIETI-ATZ-2026-000123');
    expect(formatearFolio(2026, 42)).toBe('RIETI-2026-000042');
    for (const f of ['RIETI-ATZ-2026-000123', 'RIETI-2026-000042']) expect(PATRON_FOLIO.test(f)).toBe(true);
    for (const f of ['RIETI-AT-2026-000123', 'RIETI-ATZ-26-000123', 'RIETI-atz-2026-000123', 'RIETI-2026-42']) expect(PATRON_FOLIO.test(f)).toBe(false);
  });
  it('125 claves de 3 letras, únicas, una por municipio; las del socio están fijas', () => {
    expect(CLAVES_FOLIO).toHaveLength(125);
    expect(new Set(CLAVES_FOLIO.map((c) => c[1])).size).toBe(125);
    expect(CLAVES_FOLIO.every(([, c]) => /^[A-Z]{3}$/.test(c))).toBe(true);
    expect(new Set(CLAVES_FOLIO.map((c) => c[0]))).toEqual(new Set(MUNICIPIOS_EDOMEX.map((m) => m[0])));
    const clave = (inegi: string) => CLAVES_FOLIO.find((c) => c[0] === inegi)?.[1];
    expect([clave('15013'), clave('15057'), clave('15104'), clave('15121')]).toEqual(['ATZ', 'NAU', 'TLA', 'CIZ']);
  });
});
