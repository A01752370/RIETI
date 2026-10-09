import { argon2, randomBytes, randomInt, timingSafeEqual } from 'crypto';

/**
 * Clave de consulta del reporte (D-15, RF-47).
 *
 * El folio `RIETI-AAAA-NNNNNN` es secuencial y por tanto adivinable; la clave
 * aleatoria es lo que impide enumerar reportes ajenos. Se muestra una sola vez
 * al ciudadano y en la base de datos solo se guarda su hash Argon2id.
 *
 * Se usa el Argon2 integrado en Node.js ≥ 24.7 (`crypto.argon2`), así no hay
 * dependencias nativas extra en la imagen.
 */

/** Alfabeto sin caracteres ambiguos (sin 0/O, 1/I/L) para dictarla o copiarla a mano. */
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
/** 12 símbolos de 31 posibles ≈ 59 bits de entropía. */
const LONGITUD = 12;

/** Parámetros Argon2id (perfil mínimo recomendado por OWASP: m=19 MiB, t=2, p=1). */
const PARAMETROS = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 } as const;

/**
 * Genera una clave aleatoria con formato `XXXX-XXXX-XXXX`.
 * Usa `crypto.randomInt`, que es uniforme y criptográficamente seguro.
 */
export function generarClave(): string {
  let clave = '';
  for (let i = 0; i < LONGITUD; i++) clave += ALFABETO[randomInt(ALFABETO.length)];
  return `${clave.slice(0, 4)}-${clave.slice(4, 8)}-${clave.slice(8)}`;
}

/**
 * Normaliza lo que escribe el ciudadano: mayúsculas y sin guiones ni espacios.
 * Así "abcd efgh-2345" y "ABCD-EFGH-2345" son la misma clave.
 */
export function normalizarClave(clave: string): string {
  return clave.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function derivar(clave: string, sal: Buffer, p: { memory: number; passes: number; parallelism: number; tagLength: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', { message: normalizarClave(clave), nonce: sal, ...p }, (err, hash) =>
      err ? reject(err) : resolve(hash));
  });
}

/**
 * Calcula el hash Argon2id de la clave en formato PHC
 * (`$argon2id$v=19$m=…,t=…,p=…$<sal>$<hash>`), autocontenido para poder
 * cambiar los parámetros en el futuro sin romper las claves ya emitidas.
 */
export async function hashearClave(clave: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(clave, sal, PARAMETROS);
  const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '');
  return `$argon2id$v=19$m=${PARAMETROS.memory},t=${PARAMETROS.passes},p=${PARAMETROS.parallelism}$${b64(sal)}$${b64(hash)}`;
}

/**
 * Verifica una clave contra su hash PHC en tiempo constante.
 * Devuelve `false` (nunca lanza) si el hash está vacío o mal formado.
 */
export async function verificarClave(clave: string, phc: string | null | undefined): Promise<boolean> {
  const partes = phc?.split('$') ?? [];
  // ['', 'argon2id', 'v=19', 'm=..,t=..,p=..', sal, hash]
  if (partes.length !== 6 || partes[1] !== 'argon2id') return false;
  const params = Object.fromEntries(partes[3].split(',').map((kv) => kv.split('=')));
  const esperado = Buffer.from(partes[5], 'base64');
  try {
    const obtenido = await derivar(clave, Buffer.from(partes[4], 'base64'), {
      memory: Number(params.m), passes: Number(params.t), parallelism: Number(params.p), tagLength: esperado.length,
    });
    return obtenido.length === esperado.length && timingSafeEqual(obtenido, esperado);
  } catch {
    return false;
  }
}
