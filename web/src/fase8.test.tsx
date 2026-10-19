import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fijarSesion } from './api';
import { ADVERTENCIA_FOTOS, subirFotos, validarFotos } from './fotos';
import { App } from './main';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Fase 8: fotos opcionales (web)', () => {
  it('el texto de advertencia es el del socio formador', () => {
    expect(ADVERTENCIA_FOTOS).toContain('Evita tomar fotografías que pongan en riesgo a niñas, niños o adolescentes.');
    expect(ADVERTENCIA_FOTOS).toContain('No confrontes a las personas involucradas ni te expongas para obtener evidencia.');
    expect(ADVERTENCIA_FOTOS).toContain('facilitar a las Autoridades su localización.');
  });

  it('valida cantidad, tipo y tamaño de la selección', () => {
    const jpg = { type: 'image/jpeg', size: 1000 };
    expect(validarFotos([jpg, jpg, jpg])).toBeNull();
    expect(validarFotos([jpg, jpg, jpg, jpg])).toMatch(/hasta 3/);
    expect(validarFotos([{ type: 'image/gif', size: 10 }])).toMatch(/JPG, PNG o WebP/);
    expect(validarFotos([{ type: 'application/pdf', size: 10 }])).toMatch(/JPG, PNG o WebP/);
    expect(validarFotos([{ type: 'image/png', size: 30 * 1024 * 1024 }])).toMatch(/25 MB/);
  });

  it('sube directo al formulario prefirmado (sin credenciales) y luego confirma', async () => {
    const llamadas: { url: string; metodo: string; credenciales?: string; campos?: string[] }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, op?: RequestInit) => {
      llamadas.push({ url, metodo: op?.method ?? 'GET', credenciales: op?.credentials, campos: op?.body instanceof FormData ? [...op.body.keys()] : undefined });
      if (url.endsWith('/fotos/solicitud')) return new Response(JSON.stringify({ subidas: [{ id: 'u1', url: 'https://almacen.example/', campos: { key: 'entrantes/1/u1', Policy: 'p' } }], maxBytes: 5, expiraEnSegundos: 300 }), { status: 200 });
      if (url === 'https://almacen.example/') return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ fotos: 1 }), { status: 200 });
    }));
    const total = await subirFotos('RIETI-ATZ-2026-000001', 'AAAA-BBBB-CCCC', [new File([new Uint8Array([0xff, 0xd8, 0xff])], 'f.jpg', { type: 'image/jpeg' })]);
    expect(total).toBe(1);
    expect(llamadas.map((l) => `${l.metodo} ${l.url}`)).toEqual(['POST /api/v1/reportes/fotos/solicitud', 'POST https://almacen.example/', 'POST /api/v1/reportes/fotos/confirmar']);
    expect(llamadas[1].credenciales).toBe('omit');
    expect(llamadas[1].campos).toEqual(['key', 'Policy', 'file']); // el archivo va al final, como exige S3
  });

  it('el detalle del personal no pide las fotos hasta tocar "Ver fotos"', async () => {
    const detalle = {
      id: 5, folio: 'RIETI-ATZ-2026-000005', estatus: 'Recibido', ubicacion: 'x', municipio: 'Atizapán de Zaragoza', actividad: 'Venta ambulante',
      edadAproximada: '0-5', cantidadNinos: 1, situacionRiesgo: 'No', fechaCreacion: '2026-10-10T00:00:00Z', fechaActualizacion: '2026-10-10T00:00:00Z',
      latitud: null, longitud: null, descripcion: 'd', motivoDescarte: null, transicionesPermitidas: [], historial: [], numeroFotos: 2,
    };
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      if (url.endsWith('/fotos')) return new Response(JSON.stringify([{ id: 1, url: 'https://almacen.example/f1?X-Amz-Expires=60', expiraEnSegundos: 60, ancho: 80, alto: 60, bytes: 10, fecha: '2026-10-10T00:00:00Z' }]), { status: 200 });
      return new Response(JSON.stringify(detalle), { status: 200 });
    }));
    fijarSesion({ token: 't', correo: 'enlace@example.org' });
    window.history.pushState(null, '', '/personal/reportes/5');
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<App />); });
    await screen.findByRole('heading', { name: 'Fotos · 2' });
    expect(urls.some((u) => u.endsWith('/fotos'))).toBe(false);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ver fotos' })); });
    const img = await screen.findByRole('img', { name: 'Foto 1 del reporte RIETI-ATZ-2026-000005' });
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(r.container.innerHTML).not.toContain('style=');
    fijarSesion(null);
  });
});
