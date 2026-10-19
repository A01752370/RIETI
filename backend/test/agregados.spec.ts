import { celdaCsv, celdasDeCalor, minimoCasosTiempo, proteger, TAMANO_CELDA_GRADOS, tiempoHastaHito, tiemposPorEstatus, umbralMinimo } from '../src/estadisticas/agregados';

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
    expect(celdaCsv(-99.251)).toBe('-99.251'); // un número negativo no es una fórmula
    expect(celdaCsv('@SUM(A1)')).toBe("'@SUM(A1)");
  });
});

describe('tiempos hasta un hito (Fase 5)', () => {
  const h = (horas: number) => new Date(Date.UTC(2026, 9, 1) + horas * 3_600_000);
  const caso = (id: number, ...pasos: [string, number][]) => pasos.map(([estatus, horas]) => ({ idCaso: id, estatus, fecha: h(horas) }));
  const revisado = (e: string) => e !== 'Recibido';

  it('mide del alta al primer evento que cumple el hito; los casos que no lo alcanzan no cuentan', () => {
    const eventos = [
      ...caso(1, ['Recibido', 0], ['Recibido', 1], ['En revisión', 10]), // la nota de la hora 1 no es revisión
      ...caso(2, ['Recibido', 0], ['Descartado', 20]),
      ...caso(3, ['Recibido', 0], ['En revisión', 30], ['En atención', 40]),
      ...caso(4, ['Recibido', 0]), // sin revisar: no cuenta
    ];
    expect(tiempoHastaHito(eventos, revisado, 3)).toEqual({ horasPromedio: 20, horasMediana: 20, casos: 3, minimoCasos: 3 });
  });

  it('con menos casos que el mínimo responde datos insuficientes (null), pero informa cuántos hay', () => {
    const eventos = [...caso(1, ['Recibido', 0], ['Concluido', 5]), ...caso(2, ['Recibido', 0], ['Concluido', 7])];
    expect(tiempoHastaHito(eventos, (e) => e === 'Concluido', 5)).toEqual({ horasPromedio: null, horasMediana: null, casos: 2, minimoCasos: 5 });
    expect(tiempoHastaHito([], revisado, 1)).toEqual({ horasPromedio: null, horasMediana: null, casos: 0, minimoCasos: 1 });
  });

  it('la mediana no la desvía un caso extremo', () => {
    const eventos = [1, 2, 3, 4].flatMap((id) => caso(id, ['Recibido', 0], ['En revisión', id === 4 ? 1000 : 10]));
    const r = tiempoHastaHito(eventos, revisado, 3);
    expect(r.horasMediana).toBe(10);
    expect(r.horasPromedio).toBe(257.5);
  });

  it('mínimo de casos: 5 por defecto, configurable y nunca menor que el umbral', () => {
    expect(minimoCasosTiempo(3)).toBe(5);
    expect(minimoCasosTiempo(8)).toBe(8);
    process.env.ESTADISTICAS_MIN_CASOS_TIEMPO = '10';
    expect(minimoCasosTiempo(3)).toBe(10);
    process.env.ESTADISTICAS_MIN_CASOS_TIEMPO = 'x';
    expect(minimoCasosTiempo(3)).toBe(5);
    delete process.env.ESTADISTICAS_MIN_CASOS_TIEMPO;
  });
});
