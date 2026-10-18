import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fijarSesion, Municipio, ReporteDetalle } from './api';
import { SIGNIFICADO } from './estatus';
import { App } from './main';
import {
  fechaEstatusActual, filtrosDesdeUrl, textoHito, tipoEvento, transcurrido, urlDeFiltros, vecinos,
} from './paginas/personal';
import { aNuevoReporte, FORMULARIO_VACIO, hayDatos, validarFormulario, validarPaso } from './paginas/Reportar';
import { BarraProgreso, calcularLinea, IndicadorPasos, LineaProgreso } from './progreso';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const ATIZAPAN: Municipio = { id: 1, clave: '15013', nombre: 'Atizapán de Zaragoza' };
const COMPLETO = {
  ...FORMULARIO_VACIO, municipio: ATIZAPAN, calle: 'Av. López Mateos', numero: '12', colonia: 'Centro', codigoPostal: '52900',
  peligro: 'No', cantidad: '3', edades: ['0-5', '12-14'],
  conteos: { '0-5': 2, '12-14': 1 }, actividad: 'Venta ambulante', riesgo: 'No sé', descripcion: 'Dos menores vendiendo',
};

describe('asistente de reporte: validación por paso (Fase 5)', () => {
  it('cada paso valida solo sus campos, con los mismos mensajes de siempre', () => {
    expect(Object.keys(validarPaso('donde', FORMULARIO_VACIO)).sort()).toEqual(['calle', 'codigoPostal', 'colonia', 'municipio']);
    expect(Object.keys(validarPaso('quienes', FORMULARIO_VACIO))).toEqual(['peligro', 'cantidad', 'edades']);
    expect(validarPaso('como', FORMULARIO_VACIO)).toEqual({});
    expect(Object.keys(validarPaso('que', FORMULARIO_VACIO)).sort()).toEqual(['actividad', 'descripcion', 'riesgo']);
    expect(validarPaso('revisar', FORMULARIO_VACIO)).toEqual(validarFormulario(FORMULARIO_VACIO));
    expect(validarPaso('donde', FORMULARIO_VACIO).municipio).toBe('Elige el municipio donde ocurre.');
  });
  it('un paso completo no tiene errores aunque los siguientes estén vacíos', () => {
    expect(validarPaso('donde', { ...FORMULARIO_VACIO, municipio: ATIZAPAN, calle: 'x', colonia: 'y', codigoPostal: '52900' })).toEqual({});
  });
  it('salir avisa solo si ya se capturó algo', () => {
    expect(hayDatos(FORMULARIO_VACIO)).toBe(false);
    expect(hayDatos({ ...FORMULARIO_VACIO, conteos: { '0-5': 0 } })).toBe(false);
    expect(hayDatos({ ...FORMULARIO_VACIO, descripcion: 'algo' })).toBe(true);
  });
});

describe('asistente de reporte: flujo completo en la página (Fase 5)', () => {
  const respuestas: Record<string, unknown> = {
    '/api/v1/avisos-privacidad/vigente': { version: '2026-10-v3', parrafos: ['Texto del aviso.'] },
    '/api/v1/catalogos': { actividades: ['Venta ambulante', 'Otro'], rangosEdad: [], riesgos: ['Sí', 'No', 'No sé'], estatus: [] },
    '/api/v1/catalogos/municipios': [ATIZAPAN],
  };

  it('avanza y retrocede sin perder nada, valida antes de avanzar, no guarda nada en el navegador y envía el mismo cuerpo', async () => {
    const guardar = vi.spyOn(Storage.prototype, 'setItem');
    const cookieAntes = document.cookie;
    let cuerpo: unknown = null;
    vi.stubGlobal('fetch', vi.fn(async (url: string, op?: RequestInit) => {
      if (url === '/api/v1/reportes' && op?.method === 'POST') {
        cuerpo = JSON.parse(String(op.body));
        return new Response(JSON.stringify({ folio: 'RIETI-ATZ-2026-000099', claveConsulta: 'ABCD-EFGH-2345', estatus: 'Recibido', fechaCreacion: '2026-10-18T12:00:00Z' }), { status: 201 });
      }
      return new Response(JSON.stringify(respuestas[url] ?? {}), { status: 200 });
    }));
    window.history.pushState(null, '', '/reportar');
    await act(async () => { render(<App />); });

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Leí y acepto el aviso de privacidad' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continuar' })); });

    // Paso 1 (Fase 6): cómo reportar; anónimo por defecto y "con seguimiento" solo en la app.
    expect(await screen.findByRole('heading', { name: '¿Cómo quieres realizar tu reporte?' })).toBeTruthy();
    const pasos = screen.getByRole('navigation', { name: 'Pasos del reporte' });
    expect(within(pasos).getAllByRole('listitem')[0].getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('5');
    expect((screen.getAllByRole('radio', { name: /Anónimo/ })[0] as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    await screen.findByRole('heading', { name: '¿Dónde ocurre?' });

    // Sin datos no avanza: resumen de errores y error junto al campo.
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByRole('alert').textContent).toContain('Escribe la calle.');
    expect(screen.getByLabelText('Calle').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('heading', { name: '¿Dónde ocurre?' })).toBeTruthy();

    const municipio = screen.getByRole('combobox', { name: 'Municipio donde ocurre' });
    fireEvent.change(municipio, { target: { value: 'atiz' } });
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Atizapán de Zaragoza' }));
    fireEvent.change(screen.getByLabelText('Calle'), { target: { value: ' Av. López Mateos ' } });
    fireEvent.change(screen.getByLabelText('Número exterior (opcional)'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Colonia'), { target: { value: 'Centro' } });
    fireEvent.change(screen.getByLabelText('Código postal'), { target: { value: '52900' } });
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));

    // Paso 2, y el foco va al título del paso.
    const titulo2 = await screen.findByRole('heading', { name: '¿A quiénes viste?' });
    expect(document.activeElement).toBe(titulo2);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('3');
    fireEvent.click(screen.getByRole('radio', { name: 'Sí' }));
    expect(screen.getByRole('link', { name: 'Llamar al 911' }).getAttribute('href')).toBe('tel:911');
    fireEvent.click(screen.getByRole('radio', { name: 'No' }));
    fireEvent.click(screen.getByRole('radio', { name: '3' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '0–5' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '12–14' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar uno: De 12 a 14 años' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar uno: De 0 a 5 años' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar uno: De 0 a 5 años' }));

    // Atrás conserva lo capturado.
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect((screen.getByLabelText('Colonia') as HTMLInputElement).value).toBe('Centro');
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByText('Total: 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));

    // Paso 3.
    await screen.findByRole('heading', { name: '¿Qué ocurre?' });
    fireEvent.change(screen.getByLabelText('¿Qué actividad realizaban?'), { target: { value: 'Venta ambulante' } });
    fireEvent.click(screen.getByLabelText('No sé'));
    fireEvent.change(screen.getByLabelText('Describe lo que observaste'), { target: { value: 'Dos menores vendiendo' } });
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));

    // Paso 4: revisión con "Editar" por bloque; editar y "Guardar y revisar" vuelve aquí.
    await screen.findByRole('heading', { name: 'Revisa y envía' });
    expect(screen.getByText('Av. López Mateos 12, Col. Centro, C.P. 52900')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Editar: A quiénes' }));
    await screen.findByRole('heading', { name: '¿A quiénes viste?' });
    fireEvent.click(screen.getByRole('button', { name: /Guardar y revisar/ }));
    await screen.findByRole('heading', { name: 'Revisa y envía' });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Enviar reporte/ })); });
    expect(await screen.findByText('RIETI-ATZ-2026-000099')).toBeTruthy();
    expect(cuerpo).toEqual(aNuevoReporte({ ...COMPLETO, conteos: { '0-5': 2, '12-14': 1 } }, '2026-10-v3'));
    expect(cuerpo).toMatchObject({ canal: 'web', peligroInmediato: 'No', cantidad: '3' });
    // La pantalla de folio muestra la línea de avance en "Recibido".
    expect(screen.getByRole('list', { name: 'Avance del reporte' }).querySelector('[aria-current="step"]')?.textContent).toContain('Registrado');

    // Privacidad: nada del formulario se guardó en el navegador.
    expect(guardar).not.toHaveBeenCalled();
    expect(document.cookie).toBe(cookieAntes);
  });
});

describe('línea de progreso del estatus (Fase 5)', () => {
  it('alcanzados con fecha, actual resaltado, pendientes sin fecha', () => {
    const l = calcularLinea('En atención', [{ estatus: 'Recibido', fecha: 'a' }, { estatus: 'En revisión', fecha: 'b' }, { estatus: 'En atención', fecha: 'c' }]);
    expect(l.pasos.map((p) => p.estado)).toEqual(['alcanzado', 'alcanzado', 'actual', 'pendiente', 'pendiente']);
    expect(l.pasos.map((p) => p.fecha)).toEqual(['a', 'b', 'c', null, null]);
    expect(l.final).toBeNull();
  });
  it('omitidos, descartado como final distinto y reincidencia', () => {
    expect(calcularLinea('Concluido', [{ estatus: 'Recibido', fecha: 'a' }, { estatus: 'En revisión', fecha: 'b' }, { estatus: 'Canalizado', fecha: 'c' }, { estatus: 'Concluido', fecha: 'd' }])
      .pasos[2].estado).toBe('omitido');
    const d = calcularLinea('Descartado', [{ estatus: 'Recibido', fecha: 'a' }, { estatus: 'Descartado', fecha: 'b' }]);
    expect(d.pasos.map((p) => p.estatus)).toEqual(['Recibido']);
    expect(d.final?.fecha).toBe('b');
    const r = calcularLinea('En atención', [{ estatus: 'Recibido', fecha: 'a' }, { estatus: 'Concluido', fecha: 'b' }, { estatus: 'En atención', fecha: 'c' }]);
    expect(r.pasos[4].estado).toBe('pendiente');
  });
  it('se dibuja con aria-current y sin estilos en línea; el final descartado se anuncia aparte', () => {
    const { container } = render(<LineaProgreso linea={calcularLinea('Descartado', [{ estatus: 'Recibido', fecha: '2026-10-01T00:00:00Z' }, { estatus: 'Descartado', fecha: '2026-10-02T00:00:00Z' }])} />);
    expect(screen.getByRole('note').textContent).toContain('Cancelado');
    expect(screen.getByText(SIGNIFICADO.Descartado)).toBeTruthy();
    expect(container.innerHTML).not.toContain('style=');
  });
  it('ningún significado promete tiempos', () => {
    for (const [e, t] of Object.entries(SIGNIFICADO)) expect(t, e).not.toMatch(/\b(horas?|d[ií]as?|semanas?|pronto|plazo|m[aá]ximo)\b/i);
  });
  it('indicador de pasos y barra de progreso accesibles', () => {
    const elegir = vi.fn();
    const { container } = render(<><IndicadorPasos pasos={['Uno', 'Dos', 'Tres', 'Cuatro']} actual={1} maximo={3} alElegir={elegir} /><BarraProgreso total={4} actual={1} nombre="Dos" /></>);
    const barra = screen.getByRole('progressbar');
    expect([barra.getAttribute('aria-valuenow'), barra.getAttribute('aria-valuemax'), barra.getAttribute('aria-valuetext')]).toEqual(['2', '4', 'Paso 2 de 4: Dos']);
    expect(screen.getAllByRole('listitem')[1].getAttribute('aria-current')).toBe('step');
    fireEvent.click(screen.getByRole('button', { name: /Uno.*volver a este paso/ }));
    expect(elegir).toHaveBeenCalledWith(0);
    expect(container.innerHTML).not.toContain('style=');
  });
});

describe('detalle y bandeja del personal (Fase 5)', () => {
  it('los filtros viajan en la URL y regresan iguales', () => {
    const f = filtrosDesdeUrl('?estatus=En+revisi%C3%B3n&riesgo=S%C3%AD&pendientes=true&municipioId=3&pagina=2&orden=antiguos&prioridad=Alta');
    expect(f).toMatchObject({ estatus: 'En revisión', riesgo: 'Sí', pendientes: true, municipioId: 3, pagina: 2, orden: 'antiguos', prioridad: 'Alta' });
    expect(filtrosDesdeUrl(urlDeFiltros(f))).toEqual(f);
    expect(urlDeFiltros({ orden: 'prioridad', pagina: 1 })).toBe('');
    expect(filtrosDesdeUrl('').orden).toBe('prioridad'); // Fase 6: Alta primero por omisión
  });
  it('anterior y siguiente dentro de la bandeja', () => {
    expect(vecinos([5, 9, 2], 9)).toEqual({ anterior: 5, siguiente: 2, posicion: 2, total: 3 });
    expect(vecinos([5, 9, 2], 5).anterior).toBeUndefined();
    expect(vecinos([5], 7).posicion).toBe(0);
  });
  it('tiempos medidos, igual que en la app', () => {
    const ahora = new Date('2026-10-18T12:00:00Z');
    expect(transcurrido('2026-10-18T11:15:00Z', ahora)).toBe('45 min');
    expect(transcurrido('2026-10-17T09:00:00Z', ahora)).toBe('1 día y 3 h');
    expect(transcurrido('2026-09-27T12:00:00Z', ahora)).toBe('21 días');
    expect(transcurrido('x', ahora)).toBeNull();
  });
  it('con pocos casos el panel dice "datos insuficientes" en lugar de un promedio', () => {
    expect(textoHito({ horasPromedio: null, horasMediana: null, casos: 2, minimoCasos: 5 }).valor).toBe('Datos insuficientes');
    expect(textoHito({ horasPromedio: 72, horasMediana: 50, casos: 9, minimoCasos: 5 })).toEqual({ valor: '3 días', detalle: 'Mediana: 2.1 días · 9 casos medidos.' });
  });
  it('clase de evento y fecha del estatus vigente aun con un servidor anterior (sin "tipo")', () => {
    const h = [{ estatus: 'Recibido', comentario: null, autor: null, fecha: 'a' }, { estatus: 'En revisión', comentario: 'x', autor: 'p', fecha: 'b' }, { estatus: 'En revisión', comentario: 'nota', autor: 'p', fecha: 'c' }];
    expect(h.map((_, i) => tipoEvento(h, i))).toEqual(['registro', 'cambio', 'nota']);
    expect(fechaEstatusActual({ historial: h, fechaCreacion: 'a' } as unknown as ReporteDetalle)).toBe('b');
  });

  const DETALLE = {
    id: 7, folio: 'RIETI-2026-000007', estatus: 'En revisión', ubicacion: 'Calle 5', municipio: 'Atizapán de Zaragoza', actividad: 'Venta ambulante',
    edadAproximada: '0-5', cantidadNinos: 3, situacionRiesgo: 'Sí', prioridad: 'Alta', peligroInmediato: 'Sí', fechaCreacion: '2026-10-10T00:00:00Z', fechaActualizacion: '2026-10-11T00:00:00Z',
    latitud: null, longitud: null, descripcion: 'Descripción ficticia', motivoDescarte: null, transicionesPermitidas: ['En atención', 'Canalizado', 'Descartado'],
    grupos: [{ rango: '0-5', cantidad: 2 }, { rango: '12-17', cantidad: 1 }], actividadOtro: null,
    direccion: { calle: 'Calle 5', numeroExterior: null, colonia: 'Centro', codigoPostal: '52900', referencias: null },
    fechaEstatusActual: '2026-10-11T00:00:00Z',
    historial: [
      { tipo: 'registro', estatus: 'Recibido', comentario: null, autor: null, fecha: '2026-10-10T00:00:00Z' },
      { tipo: 'cambio', estatus: 'En revisión', comentario: 'Se asigna', autor: 'enlace@example.org', fecha: '2026-10-11T00:00:00Z' },
      { tipo: 'nota', estatus: 'En revisión', comentario: 'Se programa visita', autor: 'enlace@example.org', fecha: '2026-10-12T00:00:00Z' },
    ],
  };

  it('el detalle muestra riesgo, tiempo en el estatus, acciones válidas, bitácora clasificada y descarte con motivo obligatorio', async () => {
    fijarSesion({ token: 't', correo: 'enlace@example.org' });
    window.history.pushState(null, '', '/personal/reportes/7');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(DETALLE), { status: 200 })));
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<App />); });
    await screen.findByRole('heading', { level: 1, name: 'RIETI-2026-000007' });
    expect(screen.getAllByText('Riesgo percibido').length).toBeGreaterThan(0);
    expect(screen.getByText(/En “En revisión” desde hace/)).toBeTruthy();
    expect(screen.getAllByText('Prioridad alta').length).toBeGreaterThan(0);
    const grupo = screen.getByRole('group', { name: 'Cambios de estatus permitidos' });
    expect(within(grupo).getAllByRole('button').map((b) => b.textContent)).toEqual(['En seguimiento', 'Canalizado', 'Cancelado']);
    fireEvent.click(within(grupo).getByRole('button', { name: 'Cancelado' }));
    expect((screen.getByRole('button', { name: 'Cambiar a “Cancelado”' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Motivo de la cancelación (obligatorio)'), { target: { value: 'Duplicado' } });
    expect((screen.getByRole('button', { name: 'Cambiar a “Cancelado”' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('Nota interna', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('Cambio de estatus a “En revisión”')).toBeTruthy();
    expect(r.container.innerHTML).not.toContain('style=');
    fijarSesion(null);
  });
});
