import { createHash } from 'crypto';

/** Formatos aceptados (Fase 8). Se detectan por contenido, nunca por extensión ni por el tipo declarado. */
export type FormatoFoto = 'jpeg' | 'png' | 'webp';

/** Tamaño máximo de cada foto subida (bytes). */
export const MAX_BYTES_FOTO = 5 * 1024 * 1024;

/** Fotos por reporte. */
export const MAX_FOTOS_POR_REPORTE = 3;

/** Lado mayor de la imagen guardada (px); las más grandes se reducen. */
export const LADO_MAXIMO = 2048;

/** Píxeles máximos de entrada (evita "bombas" de descompresión). */
export const MAX_PIXELES_ENTRADA = 50_000_000;

/**
 * Formato real de la imagen por sus primeros bytes ("números mágicos").
 *
 * @returns el formato, o null si no es JPEG, PNG ni WebP
 */
export function formatoReal(b: Buffer): FormatoFoto | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Resultado de la re-codificación. */
export interface ImagenRecodificada {
  datos: Buffer;
  ancho: number;
  alto: number;
  sha256: string;
}

/**
 * Re-codifica la imagen en el servidor: aplica la orientación y la vuelve a escribir como
 * JPEG **sin metadatos** (EXIF, GPS, XMP, ICC), reducida a {@link LADO_MAXIMO}. Al decodificar
 * y codificar de nuevo, cualquier contenido oculto después de los datos de imagen se pierde.
 *
 * `sharp` se carga al usarse: si la librería nativa faltara, solo fallaría la carga de fotos.
 *
 * @throws Error si el contenido no es una imagen válida o excede los píxeles permitidos
 */
export async function recodificar(entrada: Buffer): Promise<ImagenRecodificada> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require('sharp') as typeof import('sharp').default;
  const { data, info } = await sharp(entrada, { limitInputPixels: MAX_PIXELES_ENTRADA, failOn: 'error', pages: 1 })
    .rotate()
    .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { datos: data, ancho: info.width, alto: info.height, sha256: createHash('sha256').update(data).digest('hex') };
}
