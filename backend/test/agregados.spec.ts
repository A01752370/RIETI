import { celdaCsv, celdasDeCalor, proteger, TAMANO_CELDA_GRADOS, tiemposPorEstatus, umbralMinimo } from '../src/estadisticas/agregados';

describe('umbral mínimo de celda', () => {
  afterEach(() => { delete process.env.ESTADISTICAS_UMBRAL; });

  it('por defecto 3; configurable y con valores inválidos vuelve a 3', () => {
    expect(umbralMinimo()).toBe(3);
    process.env.ESTADISTICAS_UMBRAL = '5';
    expect(umbralMinimo()).toBe(5);
    process.env.ESTADISTICAS_UMBRAL = '0';
    expect(umbralMinimo()).toBe(3);
    process.env.ESTADISTICAS_UMBRAL = 'abc';
    expect(umbralMinimo()).toBe(3);
  });

  it('oculta los conteos menores que el umbral y conserva el orden', () => {
    expect(proteger([{ etiqueta: 'A', total: 5 }, { etiqueta: 'B', total: 2 }, { etiqueta: 'C', total: 3 }], 3))
      .toEqual([{ etiqueta: 'A', total: 5 }, { etiqueta: 'B', total: null }, { etiqueta: 'C', total: 3 }]);
  });
});

describe('tiempos por estatus', () => {
  const h = (horas: number) => new Date(Date.UTC(2026, 9, 1) + horas * 3_600_000);
  const ORDEN = ['Recibido', 'En revisión', 'En atención'];

  it('promedia el tiempo en cada estatus; las notas sin cambio no cuentan; el vigente no se mide', () => {
    const eventos = [
      { idCaso: 1, estatus: 'Recibido', fecha: h(0) },
      { idCaso: 1, estatus: 'Recibido', fecha: h(1) },      // nota
      { idCaso: 1, estatus: 'En revisión', fecha: h(10) },
      { idCaso: 1, estatus: 'En atención', fecha: h(30) },   // vigente
      { idCaso: 2, estatus: 'Recibido', fecha: h(0) },
      { idCaso: 2, estatus: 'En revisión', fecha: h(20) },  // vigente
    ];
    expect(tiemposPorEstatus(eventos, ORDEN, 1)).toEqual([
      { estatus: 'Recibido', horasPromedio: 15, casos: 2 },
      { estatus: 'En revisión', horasPromedio: 20, casos: 1 },
      { estatus: 'En atención', horasPromedio: null, casos: 0 },
    ]);
  });

  it('oculta el promedio si hay menos casos que el umbral', () => {
    const eventos = [{ idCaso: 1, estatus: 'Recibido', fecha: h(0) }, { idCaso: 1, estatus: 'En revisión', fecha: h(5) }];
    expect(tiemposPorEstatus(eventos, ORDEN, 3)[0]).toEqual({ estatus: 'Recibido', horasPromedio: null, casos: 1 });
  });
});

describe('mapa de calor', () => {
  it('agrupa en celdas, devuelve el centro (no el punto) y oculta celdas pequeñas', () => {
    const base = { lat: 19.5594, lng: -99.2512 };
    const puntos = [base, { lat: 19.5595, lng: -99.2513 }, { lat: 19.5596, lng: -99.2511 }, { lat: 19.3, lng: -99.6 }];
    const r = celdasDeCalor(puntos, 3);
    expect(r.ocultas).toBe(1);
    expect(r.celdas).toHaveLength(1);
    expect(r.celdas[0].total).toBe(3);
    // El centro de la celda no coincide con ningún punto y está a menos de media celda.
    expect(puntos.some((p) => p.lat === r.celdas[0].lat && p.lng === r.celdas[0].lng)).toBe(false);
    expect(Math.abs(r.celdas[0].lat - base.lat)).toBeLessThanOrEqual(TAMANO_CELDA_GRADOS);
  });
});

describe('CSV', () => {
  it('escapa comillas, comas y saltos de línea', () => {
    expect(celdaCsv('Av. 5, Col. Centro')).toBe('"Av. 5, Col. Centro"');
    expect(celdaCsv('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(celdaCsv(null)).toBe('');
    expect(celdaCsv(3)).toBe('3');
  });

  it('neutraliza la inyección de fórmulas', () => {
    expect(celdaCsv('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(celdaCsv('+52 55')).toBe("'+52 55");
    expect(celdaCsv('-1')).toBe("'-1");
    expect(celdaCsv('@SUM(A1)')).toBe("'@SUM(A1)");
  });
});
