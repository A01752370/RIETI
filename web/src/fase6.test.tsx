import { describe, expect, it } from 'vitest';
import { ESTATUS, etiquetaEstatus, PATRON_FOLIO, SIGNIFICADO } from './estatus';
import { FORMULARIO_VACIO, gruposDesde, validarQuienes } from './paginas/Reportar';
import { calcularLinea } from './progreso';

describe('Fase 6: alineación con el socio formador (web)', () => {
  it('folios nuevos con clave municipal y heredados', () => {
    for (const f of ['RIETI-ATZ-2026-000123', 'RIETI-2026-000123']) expect(PATRON_FOLIO.test(f)).toBe(true);
    for (const f of ['RIETI-AT-2026-000123', 'RIETI-atz-2026-000123', 'RIETI-2026-123']) expect(PATRON_FOLIO.test(f)).toBe(false);
  });

  it('etiquetas públicas del catálogo del socio y significados sin plazos', () => {
    expect(ESTATUS.map(etiquetaEstatus)).toEqual(['Registrado', 'En revisión', 'En seguimiento', 'Canalizado', 'Concluido', 'Cancelado', 'Archivado', 'Reincidente']);
    for (const e of ESTATUS) expect(SIGNIFICADO[e]).not.toMatch(/\b(horas?|d[ií]as?|semanas?|pronto|plazo)\b/i);
  });

  it('cantidad y edad: una edad lleva toda la cantidad; varias exigen cuadrar los contadores', () => {
    const f = { ...FORMULARIO_VACIO, peligro: 'No' };
    expect(gruposDesde({ ...f, cantidad: '5+', edades: ['15-17'] })).toEqual([{ rango: '15-17', cantidad: 5 }]);
    expect(gruposDesde({ ...f, cantidad: 'No sé', edades: ['Sin determinar'] })).toEqual([{ rango: 'Sin determinar', cantidad: 1 }]);
    expect(validarQuienes({ ...f, cantidad: '3', edades: ['0-5', '6-11'], conteos: { '0-5': 2, '6-11': 1 } })).toEqual({});
    expect(validarQuienes({ ...f, cantidad: '3', edades: ['0-5', '6-11'], conteos: { '0-5': 3 } }).grupos).toBeTruthy();
    expect(validarQuienes({ ...f, cantidad: 'No sé', edades: ['0-5', '6-11'], conteos: { '0-5': 1, '6-11': 1 } })).toEqual({});
  });

  it('Archivado y Reincidente se muestran aparte de la línea normal', () => {
    const a = calcularLinea('Archivado', [{ estatus: 'Recibido', fecha: 'a' }, { estatus: 'Concluido', fecha: 'b' }, { estatus: 'Archivado', fecha: 'c' }]);
    expect(a.final?.estatus).toBe('Archivado');
    const r = calcularLinea('Reincidente', [{ estatus: 'Recibido', fecha: 'a' }, { estatus: 'Concluido', fecha: 'b' }, { estatus: 'Reincidente', fecha: 'c' }]);
    expect(r.final).toEqual({ estatus: 'Reincidente', estado: 'actual', fecha: 'c' });
    expect(r.pasos.every((p) => p.estado === 'alcanzado')).toBe(true);
  });
});
