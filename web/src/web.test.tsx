import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { consulta, errorDesdeRespuesta, MENSAJES, Municipio } from './api';
import { claseEstatus, ESTATUS, SIGNIFICADO } from './estatus';
import { App } from './main';
import { BarrasPorEstatus, SeriePorMes } from './paginas/personal';
import { FORMULARIO_VACIO, validarFormulario } from './paginas/Reportar';
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
  it('pide todos los campos, incluido el municipio', () => {
    expect(Object.keys(validarFormulario(FORMULARIO_VACIO)).sort())
      .toEqual(['actividad', 'cantidad', 'descripcion', 'edad', 'municipio', 'riesgo', 'ubicacion'].sort());
  });
  it('acepta un formulario completo', () => {
    expect(validarFormulario({
      municipio: MUNICIPIOS[0], ubicacion: 'Crucero', cantidad: '2 a 3', edad: '6-11',
      actividad: 'Venta ambulante', riesgo: 'No sé', descripcion: 'Dos menores vendiendo',
    })).toEqual({});
  });
});

describe('estatus', () => {
  it('los 6 estatus tienen significado y clase de color', () => {
    expect(ESTATUS.map(claseEstatus)).toEqual(['recibido', 'en-revision', 'en-atencion', 'canalizado', 'concluido', 'descartado']);
    for (const e of ESTATUS) expect(SIGNIFICADO[e]).toBeTruthy();
  });
});

describe('gráficas', () => {
  const porEstatus = ESTATUS.map((e, i) => ({ etiqueta: e, total: i }));
  it('las barras llevan etiqueta directa, valor, tooltip y descripción accesible', () => {
    const { container } = render(<BarrasPorEstatus datos={porEstatus} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toContain('En atención: 2');
    expect(container.querySelectorAll('rect')).toHaveLength(6);
    expect(container.querySelectorAll('title')[5].textContent).toBe('Descartado: 5 reporte(s)');
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

  it('Reportar empieza por el aviso de privacidad con su versión, y Continuar está desactivado', async () => {
    await irA('/reportar');
    expect(await screen.findByText('Versión 2026-10-v1')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
