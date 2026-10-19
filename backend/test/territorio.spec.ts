import { diasPrincipales, hallazgosPorZona, masFrecuente, mejorVentanaHoras, normalizarColonia, redondear, ReporteHallazgo } from '../src/estadisticas/territorio';

describe('territorio: colonias normalizadas (Fase 9)', () => {
  it('agrupa variantes de escritura de la misma colonia', () => {
    const variantes = ['Col. Centro', 'centro', ' CENTRO ', 'Colonia Centro', 'Céntro'];
    expect(new Set(variantes.map(normalizarColonia))).toEqual(new Set(['centro']));
    expect(normalizarColonia('Fracc. Las Alamedas')).toBe('las alamedas');
    expect(normalizarColonia('U. Hab. Adolfo López Mateos')).toBe('adolfo lopez mateos');
    expect(normalizarColonia('')).toBeNull();
    expect(normalizarColonia('  ...  ')).toBeNull();
    expect(normalizarColonia(null)).toBeNull();
  });

  it('redondea celdas', () => {
    expect(redondear(19.55947, 3)).toBe(19.559);
    expect(redondear(-99.25151, 3)).toBe(-99.252);
  });
});

describe('territorio: hallazgos automáticos (Fase 9)', () => {
  const r = (dia: number, hora: number, extra: Partial<ReporteHallazgo> = {}): ReporteHallazgo =>
    ({ lat: 19.55941, lng: -99.25121, dia, hora, colonia: 'Centro', municipio: 'Atizapán de Zaragoza', ...extra });

  it('ventana de 4 horas y días principales', () => {
    expect(mejorVentanaHoras([17, 18, 18, 20, 9])).toEqual({ desde: 17, hasta: 21, total: 4 });
    expect(diasPrincipales([5, 5, 6, 6, 6, 1])).toEqual([5, 6]); // viernes y sábado
    expect(diasPrincipales([3, 3, 3, 1])).toEqual([3]);
    expect(diasPrincipales([0, 1, 2, 3, 4, 5, 6])).toBeNull(); // sin patrón
  });

  it('redacta "principalmente viernes y sábados entre 17:00 y 21:00 h" con datos reales', () => {
    const datos = [r(5, 17), r(5, 18), r(6, 19), r(6, 20), r(6, 18), r(2, 10, { lat: 19.5594, lng: -99.2513 })];
    const [h] = hallazgosPorZona(datos, 3);
    expect(h.texto).toBe('En la colonia Centro, Atizapán de Zaragoza se han recibido 6 reportes en los últimos 3 meses, principalmente viernes y sábados entre 17:00 y 21:00 h.');
    expect(h.reportes).toBe(6);
    // El centro de la zona no es la coordenada de ningún reporte.
    expect(datos.some((d) => d.lat === h.lat && d.lng === h.lng)).toBe(false);
  });

  it('sin datos suficientes no inventa hallazgos ni patrones', () => {
    expect(hallazgosPorZona([r(5, 17), r(5, 18), r(6, 19), r(6, 20)], 3)).toEqual([]); // 4 < 5
    const disperso = [r(0, 1), r(1, 5), r(2, 9), r(3, 13), r(4, 22)];
    expect(hallazgosPorZona(disperso, 1)[0].texto).toBe('En la colonia Centro, Atizapán de Zaragoza se han recibido 5 reportes en el último mes.');
    const sinColonia = [1, 2, 3, 4, 5].map((i) => r(1, 9 + (i % 2), { colonia: null }));
    expect(hallazgosPorZona(sinColonia, 3)[0].texto).toMatch(/^En una zona de Atizapán de Zaragoza se han recibido 5 reportes/);
  });

  it('valor más frecuente', () => {
    expect(masFrecuente(['b', 'a', 'b', null])).toEqual({ valor: 'b', n: 2 });
    expect(masFrecuente([null])).toBeNull();
  });
});
