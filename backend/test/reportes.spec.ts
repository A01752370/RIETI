import { formatearFolio, redactarParaCiudadano } from '../src/reportes/reportes.service';
import { ReporteRespuestaDto } from '../src/reportes/reporte.dto';

describe('formatearFolio', () => {
  it('rellena el consecutivo a 6 dígitos', () => {
    expect(formatearFolio(2026, 42)).toBe('RIETI-2026-000042');
  });
});

describe('redactarParaCiudadano', () => {
  const completo: ReporteRespuestaDto = {
    id: 1, folio: 'RIETI-2026-000001', ubicacion: 'Calle 1', latitud: 19.5, longitud: -99.2,
    cantidadNinos: 2, edadAproximada: '6-11', actividad: 'Venta ambulante', situacionRiesgo: 'Sí',
    descripcion: 'detalle', estatus: 'Recibido', comentarioAdmin: 'nota interna',
    fechaCreacion: '2026-01-01T00:00:00.000Z', fechaActualizacion: '2026-01-01T00:00:00.000Z',
  };

  it('oculta ubicación, coordenadas, descripción y comentarios', () => {
    const r = redactarParaCiudadano(completo);
    expect(r).toMatchObject({ ubicacion: '', latitud: null, longitud: null, descripcion: '', comentarioAdmin: null });
  });

  it('conserva folio y estatus', () => {
    expect(redactarParaCiudadano(completo)).toMatchObject({ folio: completo.folio, estatus: 'Recibido' });
  });
});
