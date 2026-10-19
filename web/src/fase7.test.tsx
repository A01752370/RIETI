import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Expediente, fijarSesion } from './api';
import { App } from './main';
import { cambiosExpediente, fechaEstatusActual, filtrosDesdeUrl, formularioDe, pasosEmbudo, tipoEvento, urlDeFiltros } from './paginas/personal';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const EXPEDIENTE: Expediente = {
  responsable: { id: 4, correo: 'enlace@example.org' }, dependencia: null, fechaSeguimiento: '2026-01-15', seguimientoVencido: true,
  resultado: null, fechaCierre: null, modalidad: null, verificacion: 'Sin verificar',
  nnaIdentificados: null, nnaCanalizados: null, nnaNinas: null, nnaNinos: null,
};

describe('Fase 7: expediente interno (web)', () => {
  it('solo envía lo que cambió, con null para borrar', () => {
    const f = formularioDe(EXPEDIENTE);
    expect(cambiosExpediente(EXPEDIENTE, f)).toEqual({});
    expect(cambiosExpediente(EXPEDIENTE, { ...f, verificacion: 'Verificado', nnaIdentificados: '2', fechaSeguimiento: '', idResponsable: '' }))
      .toEqual({ verificacion: 'Verificado', nnaIdentificados: 2, fechaSeguimiento: null, idResponsable: null });
  });

  it('acciones y cambios de expediente no mueven la fecha del estatus vigente', () => {
    const h = [
      { tipo: 'registro' as const, estatus: 'Recibido', comentario: null, autor: null, fecha: 'a' },
      { tipo: 'cambio' as const, estatus: 'En revisión', comentario: null, autor: 'p', fecha: 'b' },
      { tipo: 'accion' as const, estatus: 'En revisión', comentario: 'Visita: x', autor: 'p', fecha: 'c' },
      { tipo: 'expediente' as const, estatus: 'En revisión', comentario: 'Verificación: …', autor: 'p', fecha: 'd' },
    ];
    expect(h.map((_, i) => tipoEvento(h, i))).toEqual(['registro', 'cambio', 'accion', 'expediente']);
    expect(fechaEstatusActual({ historial: h, fechaCreacion: 'a' } as never)).toBe('b');
  });

  it('los filtros nuevos de la bandeja viajan en la URL', () => {
    const f = filtrosDesdeUrl('?vencidos=true&verificacion=Caso%20confirmado');
    expect(f).toMatchObject({ vencidos: true, verificacion: 'Caso confirmado' });
    expect(urlDeFiltros(f)).toBe('?vencidos=true&verificacion=Caso+confirmado');
  });

  it('embudo: porcentajes respecto del paso anterior, sin dividir entre cero', () => {
    const p = pasosEmbudo({ recibidos: 10, verificados: 5, casosIdentificados: 2, nnaIdentificados: 4, nnaCanalizados: 3, duplicadosDescontados: 1,
      prioridadAltaPendientes: 0, seguimientosVencidos: 0, alertasAbiertas: 0 });
    expect(p.map((x) => [x.valor, x.porcentaje])).toEqual([[10, null], [5, 50], [2, 40], [3, null]]);
    expect(pasosEmbudo({ recibidos: 0, verificados: 0, casosIdentificados: 0, nnaIdentificados: 0, nnaCanalizados: 0, duplicadosDescontados: 0,
      prioridadAltaPendientes: 0, seguimientosVencidos: 0, alertasAbiertas: 0 })[1].porcentaje).toBeNull();
  });

  it('el detalle muestra el expediente, exige el resultado al concluir y distingue acciones en la bitácora', async () => {
    const detalle = {
      id: 9, folio: 'RIETI-ATZ-2026-000009', estatus: 'En atención', ubicacion: 'Calle 5', municipio: 'Atizapán de Zaragoza', actividad: 'Venta ambulante',
      edadAproximada: '0-5', cantidadNinos: 1, situacionRiesgo: 'No', prioridad: 'Normal', peligroInmediato: 'No',
      fechaCreacion: '2026-10-10T00:00:00Z', fechaActualizacion: '2026-10-11T00:00:00Z', latitud: null, longitud: null,
      descripcion: 'Descripción ficticia', motivoDescarte: null, transicionesPermitidas: ['Canalizado', 'Concluido', 'Descartado'],
      fechaEstatusActual: '2026-10-11T00:00:00Z', expediente: EXPEDIENTE, duplicadoDe: null, duplicados: [],
      historial: [
        { tipo: 'registro', estatus: 'Recibido', comentario: null, autor: null, fecha: '2026-10-10T00:00:00Z' },
        { tipo: 'accion', estatus: 'Recibido', comentario: 'Visita: se habló con la familia', autor: 'enlace@example.org', fecha: '2026-10-11T00:00:00Z' },
      ],
    };
    fijarSesion({ token: 't', correo: 'enlace@example.org' });
    window.history.pushState(null, '', '/personal/reportes/9');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(detalle), { status: 200 })));
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<App />); });
    await screen.findByRole('heading', { level: 2, name: 'Expediente' });
    expect(screen.getAllByText('Seguimiento vencido').length).toBeGreaterThan(0);
    expect(screen.getByText('Acción realizada', { selector: 'strong' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Concluido' }));
    const boton = () => screen.getByRole('button', { name: 'Cambiar a “Concluido”' }) as HTMLButtonElement;
    expect(boton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Resultado del caso (obligatorio)'), { target: { value: 'Se canalizó al DIF' } });
    expect(boton().disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Buscar posibles duplicados' })).toBeTruthy();
    expect(r.container.innerHTML).not.toContain('style=');
    fijarSesion(null);
  });

  it('la administración solo aparece en el menú para el administrador', async () => {
    window.history.pushState(null, '', '/personal/perfil');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ correo: 'x', perfil: 'Enlace municipal', grupos: [], permisos: [], municipios: [{ id: 1, nombre: 'Atizapán de Zaragoza' }] }), { status: 200 })));
    fijarSesion({ token: 't', correo: 'enlace@example.org' });
    await act(async () => { render(<App />); });
    expect(screen.queryByRole('link', { name: 'Administración' })).toBeNull();
    expect(await screen.findByText('Atizapán de Zaragoza')).toBeTruthy();
    cleanup();
    fijarSesion({ token: 't', correo: 'admin@example.org', esAdministrador: true });
    await act(async () => { render(<App />); });
    expect(screen.getByRole('link', { name: 'Administración' })).toBeTruthy();
    fijarSesion(null);
  });
});
