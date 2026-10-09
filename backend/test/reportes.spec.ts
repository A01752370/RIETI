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
