import { leerArgumentos, textoPlan } from '../src/scripts/limpiar-pruebas';

describe('script de limpieza de datos de prueba', () => {
  it('exige criterios explícitos y confirmación o simulación', () => {
    expect(leerArgumentos(['--dry-run'])).toEqual({ error: 'Indica --folios F1,F2,... o --marca' });
    expect(leerArgumentos(['--marca'])).toEqual({ error: 'Sin --dry-run hay que agregar --confirmar' });
    expect(leerArgumentos(['--folios', 'RIETI-ATZ-2026-000001,todo', '--dry-run'])).toEqual({ error: 'Folios con formato inválido: TODO' });
    expect(leerArgumentos(['--folios', 'rieti-atz-2026-000001, RIETI-2026-000002,RIETI-2026-000002', '--dry-run'])).toEqual({
      criterios: { folios: ['RIETI-ATZ-2026-000001', 'RIETI-2026-000002'], marca: false }, simular: true, confirmar: false,
    });
    expect(leerArgumentos(['--marca', '--confirmar'])).toMatchObject({ criterios: { folios: [], marca: true }, simular: false, confirmar: true });
  });

  it('el resumen no lleva descripciones ni coordenadas', () => {
    const t = textoPlan({
      reportes: [{ folio: 'RIETI-ATZ-2026-000001', municipio: 'Atizapán de Zaragoza', fecha: '2026-10-18T10:00:00.000Z', seguimientos: 3, accesos: 1, fotos: 0 }],
      noEncontrados: ['RIETI-2026-000999'], vinculosRetirados: 1, alertasEliminadas: 1, clavesS3: [],
    }, true);
    expect(t).toContain('SIMULACIÓN (no se cambió nada): Se borrarían 1 reporte(s).');
    expect(t).toContain('RIETI-ATZ-2026-000001 · Atizapán de Zaragoza · 2026-10-18 · bitácora 3 · accesos 1 · fotos 0');
    expect(t).toContain('Folios que no existen (se omiten): RIETI-2026-000999');
  });
});
