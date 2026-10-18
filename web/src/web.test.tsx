import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { consulta, errorDesdeRespuesta, MENSAJES, Municipio } from './api';
import { claseEstatus, ESTATUS, SIGNIFICADO } from './estatus';
import { App } from './main';
import { BarrasPorEstatus, SeriePorMes } from './paginas/personal';
import { aNuevoReporte, FORMULARIO_VACIO, validarFormulario } from './paginas/Reportar';
import { BarrasConteo, formatearHoras, textoConteo, textoDireccion, textoMenores } from './paginas/personal';
import { filtrarMunicipios, normalizar, SelectorMunicipio } from './SelectorMunicipio';

afterEach(cleanup);

const MUNICIPIOS: Municipio[] = [
  { id: 1, clave: '15013', nombre: 'Atizapán de Zaragoza' },
  { id: 2, clave: '15012', nombre: 'Atizapán' },
  { id: 3, clave: '15057', nombre: 'Naucalpan de Juárez' },
  { id: 4, clave: '15104', nombre: 'Tlalnepantla de Baz' },
];

describe('errores del API', () => {
  it('usa código y mensaje del servidor', () => {
    const e = errorDesdeRespuesta(404, { codigo: 'FOLIO_O_CLAVE_INCORRECTOS', mensaje: 'El folio o la clave no son correctos' });
    expect([e.codigo, e.message, e.estatus]).toEqual(['FOLIO_O_CLAVE_INCORRECTOS', 'El folio o la clave no son correctos', 404]);
  });
  it('un 401 de sesión dice qué hacer', () => {
    expect(errorDesdeRespuesta(401, { codigo: 'NO_AUTENTICADO', mensaje: 'x' }).message).toBe(MENSAJES.SESION_EXPIRADA);
  });
  it('sin cuerpo legible da un mensaje genérico con la siguiente acción', () => {
    expect(errorDesdeRespuesta(502, null).message).toBe(MENSAJES.INESPERADO);
  });
  it('consulta() omite filtros vacíos', () => {
    expect(consulta({ estatus: 'En revisión', municipioId: undefined, tamano: 50, desde: '' })).toBe('?estatus=En+revisi%C3%B3n&tamano=50');
  });
});

describe('selector de municipios (D-16)', () => {
  it('busca sin importar acentos ni mayúsculas, primero los que empiezan con el texto', () => {
    expect(normalizar('  ATIZAPÁN ')).toBe('atizapan');
    expect(filtrarMunicipios(MUNICIPIOS, 'atizapan').map((m) => m.clave)).toEqual(['15013', '15012']);
    expect(filtrarMunicipios(MUNICIPIOS, 'baz').map((m) => m.nombre)).toEqual(['Tlalnepantla de Baz']);
  });

  function Envoltura() {
    const [valor, setValor] = useState<Municipio | null>(null);
    return (
      <>
        <SelectorMunicipio municipios={MUNICIPIOS} valor={valor} alCambiar={setValor} />
        <output data-testid="elegido">{valor?.clave ?? 'ninguno'}</output>
      </>
    );
  }

  it('no preselecciona ningún municipio', () => {
    render(<Envoltura />);
    expect(screen.getByTestId('elegido').textContent).toBe('ninguno');
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('');
  });

  it('se usa solo con teclado: escribir, flechas y Enter', () => {
    render(<Envoltura />);
    const campo = screen.getByRole('combobox', { name: 'Municipio donde ocurre' });
    fireEvent.change(campo, { target: { value: 'atiz' } });
    expect(campo.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Atizapán de Zaragoza', 'Atizapán']);
    fireEvent.keyDown(campo, { key: 'ArrowDown' });
    expect(campo.getAttribute('aria-activedescendant')).toMatch(/op-2$/);
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(screen.getByTestId('elegido').textContent).toBe('15012');
    expect(campo.getAttribute('aria-expanded')).toBe('false');
  });

  it('Escape cierra la lista y muestra mensaje si nada coincide', () => {
    render(<Envoltura />);
    const campo = screen.getByRole('combobox');
    fireEvent.change(campo, { target: { value: 'zzz' } });
    expect(screen.getByText(/Ningún municipio coincide/)).toBeTruthy();
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('validación del formulario de reporte', () => {
  const completo = {
    ...FORMULARIO_VACIO, municipio: MUNICIPIOS[0], calle: 'Av. López Mateos', numero: '12', colonia: 'Centro', codigoPostal: '52900',
    peligro: 'No', cantidad: '3', edades: ['0-5', '12-14'],
    conteos: { '0-5': 2, '12-14': 1 }, actividad: 'Venta ambulante', riesgo: 'No sé', descripcion: 'Dos menores vendiendo',
  };
  it('pide todos los campos, incluido el municipio', () => {
    expect(Object.keys(validarFormulario(FORMULARIO_VACIO)).sort())
      .toEqual(['actividad', 'calle', 'cantidad', 'codigoPostal', 'colonia', 'descripcion', 'edades', 'municipio', 'peligro', 'riesgo'].sort());
  });
  it('acepta un formulario completo', () => {
    expect(validarFormulario(completo)).toEqual({});
  });
  it('valida el código postal del Estado de México, el tope de 50 y "Otro"', () => {
    expect(validarFormulario({ ...completo, codigoPostal: '06000' }).codigoPostal).toContain('Estado de México');
    expect(validarFormulario({ ...completo, cantidad: '5+', conteos: { '0-5': 30, '12-14': 21 } }).grupos).toContain('50');
    expect(validarFormulario({ ...completo, cantidad: '4' }).grupos).toContain('no coincide');
    expect(validarFormulario({ ...completo, actividad: 'Otro' }).actividadOtro).toBeTruthy();
  });
  it('arma el cuerpo con el formato nuevo: grupos en orden y sin campos vacíos', () => {
    expect(aNuevoReporte({ ...completo, conteos: { '12-14': 1, '6-11': 4, '0-5': 2 } }, '2026-10-v1')).toEqual({
      municipioId: MUNICIPIOS[0].id,
      direccion: { calle: 'Av. López Mateos', numeroExterior: '12', colonia: 'Centro', codigoPostal: '52900' },
      grupos: [{ rango: '0-5', cantidad: 2 }, { rango: '12-14', cantidad: 1 }],
      actividad: 'Venta ambulante', situacionRiesgo: 'No sé', descripcion: 'Dos menores vendiendo', avisoPrivacidadVersion: '2026-10-v1',
      peligroInmediato: 'No', cantidad: '3', canal: 'web',
    });
  });
});

describe('detalle del personal (Fase 2)', () => {
  it('muestra los grupos de edad y el total', () => {
    expect(textoMenores([{ rango: '0-5', cantidad: 2 }, { rango: '12-17', cantidad: 1 }], 3, '0-5')).toBe('2 de 0 a 5 años · 1 de 12 a 17 años (total 3)');
    expect(textoMenores(undefined, 2, '6-11')).toBe('2 de 6 a 11 años');
  });
  it('arma la dirección en una línea', () => {
    expect(textoDireccion({ calle: 'Av. López Mateos', numeroExterior: '12', colonia: 'Centro', codigoPostal: '52900', referencias: null }))
      .toBe('Av. López Mateos 12, Col. Centro, C.P. 52900');
    expect(textoDireccion(null)).toBeNull();
  });
});

describe('panel (Fase 3)', () => {
  it('formatea horas y días', () => {
    expect(formatearHoras(null)).toBe('—');
    expect(formatearHoras(5.25)).toBe('5.3 h');
    expect(formatearHoras(72)).toBe('3 días');
  });
  it('los conteos ocultos por el umbral se leen como "menos de N"', () => {
    expect(textoConteo(null, 3)).toBe('menos de 3');
    expect(textoConteo(7, 3)).toBe('7');
  });
  it('las barras de conteos protegidos no usan estilos en línea y describen los ocultos', () => {
    const { container } = render(<BarrasConteo titulo="Por municipio" umbral={3}
      datos={[{ etiqueta: 'Atizapán de Zaragoza', total: 12 }, { etiqueta: 'Naucalpan de Juárez', total: null }]} />);
    expect(container.innerHTML).not.toContain('style=');
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toContain('Naucalpan de Juárez: menos de 3');
  });
});

describe('estatus', () => {
  it('los 8 estatus tienen significado y clase de color (Fase 6)', () => {
    expect(ESTATUS.map(claseEstatus)).toEqual(['recibido', 'en-revision', 'en-atencion', 'canalizado', 'concluido', 'descartado', 'archivado', 'reincidente']);
    for (const e of ESTATUS) expect(SIGNIFICADO[e]).toBeTruthy();
  });
});

describe('gráficas', () => {
  const porEstatus = ESTATUS.map((e, i) => ({ etiqueta: e, total: i }));
  it('las barras llevan etiqueta directa, valor, tooltip y descripción accesible', () => {
    const { container } = render(<BarrasPorEstatus datos={porEstatus} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toContain('En seguimiento: 2');
    expect(container.querySelectorAll('rect')).toHaveLength(8);
    expect(container.querySelectorAll('title')[5].textContent).toBe('Cancelado: 5 reporte(s)');
  });
  it('no usan estilos en línea (la CSP los bloquearía)', () => {
    const { container } = render(<><BarrasPorEstatus datos={porEstatus} /><SeriePorMes datos={[{ etiqueta: '2026-10', total: 3 }]} /></>);
    expect(container.innerHTML).not.toContain('style=');
  });
});

describe('páginas públicas', () => {
  const respuestas: Record<string, unknown> = {
    '/api/v1/avisos-privacidad/vigente': { version: '2026-10-v1', parrafos: ['Texto del aviso.'] },
    '/api/v1/red-municipios': { hayDatosDeEjemplo: true, municipios: [{ id: 1, clave: '15013', nombre: 'Atizapán de Zaragoza', contactos: [{ tipo: 'correo', valor: 'enlace.atizapan@example.org', etiqueta: null, esEjemplo: true }] }] },
  };
  const irA = async (ruta: string) => {
    window.history.pushState(null, '', ruta);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(respuestas[url] ?? {}), { status: 200 })));
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<App />); });
    return r;
  };

  for (const ruta of ['/', '/como-funciona', '/reportar', '/seguimiento', '/red-de-municipios', '/aviso-de-privacidad', '/personal']) {
    it(`${ruta}: 911/089 visibles, logos con alt y medidas, sin estilos en línea`, async () => {
      const { container } = await irA(ruta);
      expect(screen.getAllByRole('link', { name: '911' }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('link', { name: '089' }).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /Salida rápida/ })).toBeTruthy();
      for (const img of Array.from(container.querySelectorAll('img'))) {
        expect(img.getAttribute('alt')).toBeTruthy();
        expect(img.getAttribute('width')).toBeTruthy();
        expect(img.getAttribute('height')).toBeTruthy();
      }
      expect(screen.getAllByRole('link', { name: 'Aviso de privacidad' }).length).toBeGreaterThan(0);
      expect(container.innerHTML).not.toContain('style=');
    });
  }

  it('Red de municipios muestra el aviso de datos de ejemplo', async () => {
    await irA('/red-de-municipios');
    expect(await screen.findByText('Datos de ejemplo: los contactos oficiales serán proporcionados por la institución.')).toBeTruthy();
  });

  it('el aviso de privacidad se muestra por secciones con título cuando el servidor las envía', async () => {
    const previo = respuestas['/api/v1/avisos-privacidad/vigente'];
    respuestas['/api/v1/avisos-privacidad/vigente'] = {
      version: '2026-10-v1', parrafos: ['Uno.', 'Dos.'],
      secciones: [{ titulo: 'Quién es responsable', parrafos: ['Uno.'] }, { titulo: 'Tu folio y tu clave', parrafos: ['Dos.'] }],
    };
    await irA('/aviso-de-privacidad');
    respuestas['/api/v1/avisos-privacidad/vigente'] = previo;
    expect(await screen.findByRole('heading', { level: 2, name: 'Quién es responsable' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Tu folio y tu clave' })).toBeTruthy();
    expect(screen.getByText('Dos.')).toBeTruthy();
  });

  it('Reportar empieza por el aviso de privacidad con su versión, y Continuar está desactivado', async () => {
    await irA('/reportar');
    expect(await screen.findByText('Versión 2026-10-v1')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('A6: XSS almacenado en la web del personal', () => {
  it('una descripción con HTML malicioso se muestra como texto, sin crear elementos', async () => {
    const { fijarSesion } = await import('./api');
    const ataque = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const detalle = {
      id: 1, folio: 'RIETI-2026-000001', estatus: 'Recibido', ubicacion: ataque, municipio: 'Atizapán de Zaragoza',
      actividad: 'Otro', edadAproximada: '6-11', cantidadNinos: 1, situacionRiesgo: 'No sé',
      fechaCreacion: '2026-10-10T00:00:00Z', fechaActualizacion: '2026-10-10T00:00:00Z', latitud: null, longitud: null,
      descripcion: ataque, motivoDescarte: null, transicionesPermitidas: ['En revisión'],
      historial: [{ estatus: 'Recibido', comentario: ataque, autor: null, fecha: '2026-10-10T00:00:00Z' }],
    };
    fijarSesion({ token: 'token-prueba', correo: 'enlace@example.org' });
    window.history.pushState(null, '', '/personal/reportes/1');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(detalle), { status: 200 })));
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<App />); });
    await screen.findAllByText(ataque);
    expect(r.container.querySelector('script')).toBeNull();
    expect(r.container.querySelector('img[src="x"]')).toBeNull();
    expect(r.container.querySelector('[onerror]')).toBeNull();
    // Se serializa como texto escapado (&lt;img …), no como etiqueta.
    expect(r.container.innerHTML).toContain('&lt;img src=x');
    fijarSesion(null);
  });
});
