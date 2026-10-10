import { formatearFolio, lineaDeTiempoPublica } from '../src/reportes/reportes.service';

describe('formatearFolio', () => {
  it('rellena el consecutivo a 6 dígitos', () => {
    expect(formatearFolio(2026, 42)).toBe('RIETI-2026-000042');
  });
});

describe('lineaDeTiempoPublica', () => {
  const f = (iso: string) => new Date(iso);

  it('solo expone estatus y fecha (sin comentarios ni autor)', () => {
    const r = lineaDeTiempoPublica([{ estatus: 'Recibido', fecha: f('2026-10-01T10:00:00Z') }]);
    expect(r).toEqual([{ estatus: 'Recibido', fecha: '2026-10-01T10:00:00.000Z' }]);
    expect(Object.keys(r[0]).sort()).toEqual(['estatus', 'fecha']);
  });

  it('omite las notas que no cambiaron el estatus', () => {
    const r = lineaDeTiempoPublica([
      { estatus: 'Recibido', fecha: f('2026-10-01T10:00:00Z') },
      { estatus: 'En revisión', fecha: f('2026-10-02T10:00:00Z') },
      { estatus: 'En revisión', fecha: f('2026-10-03T10:00:00Z') },
      { estatus: 'En atención', fecha: f('2026-10-04T10:00:00Z') },
    ]);
    expect(r.map((e) => e.estatus)).toEqual(['Recibido', 'En revisión', 'En atención']);
  });
});

import { MUNICIPIOS_EDOMEX } from '../src/database/datos/municipios-edomex';
import { validarContacto } from '../src/red/red.controller';

describe('catálogo de municipios (D-16, fuente INEGI)', () => {
  it('tiene exactamente 125 municipios con claves 15001 a 15125, sin repetir', () => {
    expect(MUNICIPIOS_EDOMEX).toHaveLength(125);
    const claves = MUNICIPIOS_EDOMEX.map(([c]) => c);
    expect(new Set(claves).size).toBe(125);
    expect([...claves].sort()).toEqual(Array.from({ length: 125 }, (_, i) => `15${String(i + 1).padStart(3, '0')}`));
  });

  it('Atizapán de Zaragoza es 15013 (y no se confunde con Atizapán, 15012)', () => {
    const porClave = new Map(MUNICIPIOS_EDOMEX);
    expect(porClave.get('15013')).toBe('Atizapán de Zaragoza');
    expect(porClave.get('15012')).toBe('Atizapán');
  });

  it('ningún nombre está vacío ni repetido', () => {
    const nombres = MUNICIPIOS_EDOMEX.map(([, n]) => n);
    expect(nombres.every((n) => n.trim().length > 0)).toBe(true);
    expect(new Set(nombres).size).toBe(125);
  });
});

describe('validarContacto (D-17)', () => {
  it('acepta correos y enlaces https', () => {
    expect(validarContacto({ tipo: 'correo', valor: 'enlace.atizapan@example.org' })).toBeNull();
    expect(validarContacto({ tipo: 'enlace', valor: 'https://example.org/red' })).toBeNull();
  });

  it('rechaza enlaces sin https y correos mal formados', () => {
    expect(validarContacto({ tipo: 'enlace', valor: 'http://example.org' })).toMatch(/https/);
    expect(validarContacto({ tipo: 'enlace', valor: 'javascript:alert(1)' })).toMatch(/https/);
    expect(validarContacto({ tipo: 'correo', valor: 'no-es-correo' })).toMatch(/correo/);
  });
});
