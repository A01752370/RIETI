import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Token de inyección del almacén de fotos (sustituible en pruebas). */
export const ALMACEN_FOTOS = Symbol('ALMACEN_FOTOS');

/** Formulario de subida directa (POST prefirmado de S3). */
export interface SubidaPrefirmada {
  url: string;
  campos: Record<string, string>;
}

/**
 * Almacén privado de fotos (Fase 8). Las fotos entran por `entrantes/` (subida directa
 * del cliente con un POST prefirmado de pocos minutos y tamaño máximo) y, ya validadas y
 * re-codificadas por el servidor, quedan en `fotos/` con nombre aleatorio. El bucket es
 * privado y cifrado con KMS; la lectura del personal es con URL prefirmada de corta duración.
 */
export interface AlmacenFotos {
  /** POST prefirmado para subir un objeto con esa clave exacta y hasta `maxBytes`. */
  subida(clave: string, maxBytes: number, segundos: number): Promise<SubidaPrefirmada>;
  /** Contenido de un objeto, o null si no existe o pesa más de `maxBytes`. */
  leer(clave: string, maxBytes: number): Promise<Buffer | null>;
  guardar(clave: string, datos: Buffer, tipo: string): Promise<void>;
  borrar(clave: string): Promise<void>;
  /** URL de lectura prefirmada (GET) que caduca en `segundos`. */
  urlLectura(clave: string, segundos: number): Promise<string>;
}

/** Implementación con Amazon S3 (bucket `EVIDENCIAS_BUCKET`). */
export class AlmacenS3 implements AlmacenFotos {
  private readonly s3: S3Client;

  constructor(private readonly bucket: string, region: string) {
    this.s3 = new S3Client({ region });
  }

  subida(clave: string, maxBytes: number, segundos: number): Promise<SubidaPrefirmada> {
    return createPresignedPost(this.s3, {
      Bucket: this.bucket,
      Key: clave,
      Conditions: [['content-length-range', 1, maxBytes], ['eq', '$key', clave]],
      Expires: segundos,
    }).then((p) => ({ url: p.url, campos: p.fields }));
  }

  async leer(clave: string, maxBytes: number): Promise<Buffer | null> {
    try {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: clave }));
      if ((r.ContentLength ?? 0) > maxBytes) return null;
      return Buffer.from(await r.Body!.transformToByteArray());
    } catch (e) {
      if ((e as { name?: string }).name === 'NoSuchKey') return null;
      throw e;
    }
  }

  async guardar(clave: string, datos: Buffer, tipo: string): Promise<void> {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: clave, Body: datos, ContentType: tipo }));
  }

  async borrar(clave: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: clave }));
  }

  urlLectura(clave: string, segundos: number): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: clave, ResponseCacheControl: 'no-store' }), { expiresIn: segundos });
  }
}

/** Almacén en memoria para desarrollo local sin AWS (y base del doble de pruebas). */
export class AlmacenMemoria implements AlmacenFotos {
  readonly objetos = new Map<string, Buffer>();

  async subida(clave: string): Promise<SubidaPrefirmada> {
    return { url: 'https://almacen.invalid/', campos: { key: clave } };
  }

  async leer(clave: string, maxBytes: number): Promise<Buffer | null> {
    const b = this.objetos.get(clave);
    return b && b.length <= maxBytes ? b : null;
  }

  async guardar(clave: string, datos: Buffer): Promise<void> {
    this.objetos.set(clave, datos);
  }

  async borrar(clave: string): Promise<void> {
    this.objetos.delete(clave);
  }

  async urlLectura(clave: string, segundos: number): Promise<string> {
    return `https://almacen.invalid/${clave}?expira=${segundos}`;
  }
}

/** Fábrica: S3 si hay bucket configurado; si no, memoria (desarrollo). */
export function crearAlmacen(): AlmacenFotos {
  const bucket = process.env.EVIDENCIAS_BUCKET;
  return bucket ? new AlmacenS3(bucket, process.env.AWS_REGION ?? 'mx-central-1') : new AlmacenMemoria();
}
