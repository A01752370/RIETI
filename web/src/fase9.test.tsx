import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fijarSesion } from './api';
import { App } from './main';
import { claseEscala } from './MapaTerritorial';
import { FILTROS_EXTRA_VACIOS, filtrosDesdeUrl, filtrosExtra, resumenTerritorio, urlDeFiltros } from './paginas/personal';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); fijarSesion(null); });

describe('Fase 9: mapa e inteligencia territorial (web)', () => {
  it('los filtros adicionales viajan al API sin vacíos', () => {
    expect(filtrosExtra(FILTROS_EXTRA_VACIOS)).toEqual({
      rangoEdad: undefined, riesgo: undefined, prioridad: undefined, franja: undefined, dependenciaId: undefined,
      verificacion: undefined, origen: undefined, reincidente: undefined,
    });
    expect(filtrosExtra({ ...FILTROS_EXTRA_VACIOS, franja: 'tarde', dependenciaId: '2', reincidente: true, origen: 'institucional' }))
      .toMatchObject({ franja: 'tarde', dependenciaId: 2, reincidente: true, origen: 'institucional' });
  });

  it('el origen se filtra desde la URL de la bandeja', () => {
    const f = filtrosDesdeUrl('?origen=institucional');
    expect(f.origen).toBe('institucional');
    expect(urlDeFiltros(f)).toBe('?origen=institucional');
  });

  it('escala del mapa: conteos ocultos en gris y el máximo en el color más intenso', () => {
    expect(claseEscala(null, 10)).toBe(-1);
    expect(claseEscala(10, 10)).toBe(4);
    expect(claseEscala(1, 10)).toBe(0);
    expect(claseEscala(5, 0)).toBe(-1);
  });

  it('texto alternativo de cada nivel', () => {
    expect(resumenTerritorio({ nivel: 'region', umbral: 3, municipios: [{ id: 1, clave: '15013', nombre: 'Atizapán de Zaragoza', total: 8, geometria: {} },
      { id: 2, clave: '15057', nombre: 'Naucalpan de Juárez', total: null, geometria: {} }] }))
      .toBe('Mapa de municipios: Atizapán de Zaragoza, 8 reporte(s); Naucalpan de Juárez, menos de 3 reporte(s).');
    expect(resumenTerritorio({ nivel: 'punto', umbral: 3, puntos: [{ id: 1, lat: 19.5, lng: -99.2, prioridad: 'Alta', estatus: 'Recibido' }], sinUbicacion: 2 }))
      .toBe('1 punto(s) de reportes; 2 sin punto en el mapa.');
  });

  it('registro institucional: aviso del modo y sin fotos', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/avisos-privacidad/vigente')) return new Response(JSON.stringify({ version: '2026-10-v3', parrafos: ['x'] }), { status: 200 });
      if (url.endsWith('/catalogos')) return new Response(JSON.stringify({ actividades: ['Venta ambulante'], rangosEdad: ['6-11'], riesgos: ['Sí', 'No', 'No sé'], estatus: [] }), { status: 200 });
      return new Response(JSON.stringify([{ id: 1, clave: '15013', nombre: 'Atizapán de Zaragoza' }]), { status: 200 });
    }));
    fijarSesion({ token: 't', correo: 'enlace@example.org' });
    window.history.pushState(null, '', '/personal/registrar');
    await act(async () => { render(<App />); });
    expect(await screen.findByText(/Registro institucional \(detección en recorrido\)/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Registrar' })).toBeTruthy();
  });
});
