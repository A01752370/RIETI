import sharp from 'sharp';
import { AlmacenS3 } from '../src/fotos/almacen';
import { formatoReal, LADO_MAXIMO, recodificar } from '../src/fotos/imagen';

/** JPEG de prueba con EXIF (incluida la ubicación GPS). */
async function jpegConExif(ancho = 64, alto = 48): Promise<Buffer> {
  return sharp({ create: { width: ancho, height: alto, channels: 3, background: '#3a7' } })
    .withExif({
      IFD0: { Copyright: 'Telefono de quien reporta', Make: 'MarcaFicticia', Model: 'ModeloFicticio' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '19/1 33/1 33/1', GPSLongitudeRef: 'W', GPSLongitude: '99/1 15/1 4/1' },
    })
    .jpeg()
    .toBuffer();
}

describe('fotos: tipo real por contenido (Fase 8)', () => {
  it('reconoce JPEG, PNG y WebP por sus primeros bytes', async () => {
    const base = sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } });
    expect(formatoReal(await base.clone().jpeg().toBuffer())).toBe('jpeg');
    expect(formatoReal(await base.clone().png().toBuffer())).toBe('png');
    expect(formatoReal(await base.clone().webp().toBuffer())).toBe('webp');
  });

  it('rechaza otros formatos y archivos con extensión falsa', async () => {
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).gif().toBuffer();
    expect(formatoReal(gif)).toBeNull();
    expect(formatoReal(Buffer.from('%PDF-1.7 documento renombrado como foto.jpg'))).toBeNull();
    expect(formatoReal(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(formatoReal(Buffer.from('MZ ejecutable'))).toBeNull();
    expect(formatoReal(Buffer.alloc(0))).toBeNull();
  });
});

describe('fotos: re-codificación en el servidor (Fase 8, A8)', () => {
  it('elimina EXIF y GPS, y guarda JPEG', async () => {
    const original = await jpegConExif();
    const antes = await sharp(original).metadata();
    expect(antes.exif).toBeDefined(); // la prueba tiene sentido: el original sí trae EXIF
    const r = await recodificar(original);
    const despues = await sharp(r.datos).metadata();
    expect(despues.format).toBe('jpeg');
    expect(despues.exif).toBeUndefined();
    expect(despues.xmp).toBeUndefined();
    expect(despues.icc).toBeUndefined();
    expect(r.datos.includes(Buffer.from('MarcaFicticia'))).toBe(false);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('descarta contenido oculto añadido después de la imagen', async () => {
    const original = Buffer.concat([await jpegConExif(), Buffer.from('<?php system($_GET["c"]); ?>CARGA-OCULTA')]);
    const r = await recodificar(original);
    expect(r.datos.includes(Buffer.from('CARGA-OCULTA'))).toBe(false);
  });

  it('reduce las imágenes grandes sin agrandar las pequeñas', async () => {
    const grande = await sharp({ create: { width: 4000, height: 1000, channels: 3, background: '#000' } }).png().toBuffer();
    const r = await recodificar(grande);
    expect([r.ancho, r.alto]).toEqual([LADO_MAXIMO, 512]);
    const chica = await recodificar(await jpegConExif(64, 48));
    expect([chica.ancho, chica.alto]).toEqual([64, 48]);
  });

  it('rechaza datos dañados', async () => {
    const jpeg = await jpegConExif();
    await expect(recodificar(Buffer.concat([jpeg.subarray(0, 20), Buffer.alloc(200, 7)]))).rejects.toThrow();
  });
});

describe('fotos: URL de lectura prefirmada (Fase 8)', () => {
  it('caduca en los segundos indicados y no se guarda en caché', async () => {
    Object.assign(process.env, { AWS_ACCESS_KEY_ID: 'AKIAEJEMPLOFICTICIO0', AWS_SECRET_ACCESS_KEY: 'secreto-ficticio-solo-para-firmar-en-la-prueba' });
    const url = new URL(await new AlmacenS3('bucket-de-prueba', 'mx-central-1').urlLectura('fotos/abc.jpg', 60));
    expect(url.hostname).toBe('bucket-de-prueba.s3.mx-central-1.amazonaws.com');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(url.searchParams.get('response-cache-control')).toBe('no-store');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el formulario de subida exige la clave exacta y un tamaño máximo', async () => {
    const p = await new AlmacenS3('bucket-de-prueba', 'mx-central-1').subida('entrantes/1/x', 5 * 1024 * 1024, 300);
    const politica = JSON.parse(Buffer.from(p.campos.Policy, 'base64').toString('utf8'));
    expect(politica.conditions).toEqual(expect.arrayContaining([['content-length-range', 1, 5 * 1024 * 1024], ['eq', '$key', 'entrantes/1/x']]));
    const vence = new Date(politica.expiration).getTime() - Date.now();
    expect(vence).toBeLessThanOrEqual(300_000);
    expect(vence).toBeGreaterThan(250_000);
  });
});
