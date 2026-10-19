import { api, ErrorApi, MENSAJES } from './api';

/**
 * Evidencia fotográfica opcional (Fase 8). La foto se reduce y se vuelve a codificar en el
 * navegador (sin EXIF) antes de subirla directo al almacén privado con un formulario
 * prefirmado; el servidor la valida y la vuelve a codificar de todos modos.
 */

/** Advertencia del socio formador: se debe leer y aceptar antes de elegir fotos. */
export const ADVERTENCIA_FOTOS =
  'Evita tomar fotografías que pongan en riesgo a niñas, niños o adolescentes. No confrontes a las personas involucradas ni te expongas para obtener evidencia. '
  + 'La fotografía es opcional y preferentemente del lugar o sitio donde viste a la niña, niño o adolescente en situación de trabajo para facilitar a las Autoridades su localización.';

/** Fotos por reporte. */
export const MAX_FOTOS = 3;
/** Tipos que se pueden elegir. */
export const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
/** Tamaño máximo del archivo original (se reduce antes de subirlo a ≤ 5 MB). */
export const MAX_BYTES_ORIGINAL = 25 * 1024 * 1024;
/** Lado mayor de la foto que se sube. */
const LADO_MAXIMO = 2048;

/**
 * Valida la selección (pura, probada).
 * @returns el mensaje de error, o null si la selección es válida
 */
export function validarFotos(archivos: { type: string; size: number }[]): string | null {
  if (archivos.length > MAX_FOTOS) return `Puedes adjuntar hasta ${MAX_FOTOS} fotos.`;
  if (archivos.some((a) => !TIPOS_FOTO.includes(a.type))) return 'Solo se aceptan fotos JPG, PNG o WebP.';
  if (archivos.some((a) => a.size > MAX_BYTES_ORIGINAL)) return 'Cada foto debe pesar menos de 25 MB.';
  return null;
}

/** Reduce y vuelve a codificar la foto como JPEG sin metadatos. Si el navegador no puede, se sube el original (el servidor la re-codifica). */
export async function prepararFoto(archivo: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return archivo;
  try {
    const imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    lienzo.getContext('2d')!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    imagen.close();
    return await new Promise<Blob>((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('sin imagen'))), 'image/jpeg', 0.85));
  } catch {
    return archivo;
  }
}

/**
 * Sube las fotos de un reporte recién creado: pide los formularios, sube cada foto directo
 * al almacén privado y confirma. Usa el folio y la clave, igual que la consulta.
 *
 * @returns número de fotos que quedaron en el reporte
 */
export async function subirFotos(folio: string, clave: string, archivos: File[]): Promise<number> {
  if (archivos.length === 0) return 0;
  const solicitud = await api.solicitarFotos(folio, clave, archivos.length);
  for (let i = 0; i < archivos.length; i++) {
    const { url, campos } = solicitud.subidas[i];
    const datos = new FormData();
    for (const [k, v] of Object.entries(campos)) datos.append(k, v);
    datos.append('file', await prepararFoto(archivos[i]));
    let r: Response;
    try {
      r = await fetch(url, { method: 'POST', body: datos, credentials: 'omit', cache: 'no-store' });
    } catch {
      throw new ErrorApi('SIN_CONEXION', MENSAJES.SIN_CONEXION, 0);
    }
    if (!r.ok) throw new ErrorApi('SUBIDA_FALLIDA', 'No se pudo subir una de las fotos (quizá pesa demasiado). Inténtalo de nuevo.', r.status);
  }
  return (await api.confirmarFotos(folio, clave, solicitud.subidas.map((s) => s.id))).fotos;
}
