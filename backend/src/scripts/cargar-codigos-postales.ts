import 'reflect-metadata';
import { readFileSync } from 'fs';
import { DataSource, EntityManager } from 'typeorm';
import { opcionesTypeOrm } from '../config/typeorm.config';

/**
 * Herramienta de ADMINISTRACIÓN (no es una ruta del API): carga en
 * `codigo_postal_municipio` la relación código postal → municipio del Estado de
 * México, para que el API valide que el CP de un reporte corresponda al
 * municipio elegido.
 *
 * ⚠️ El Catálogo Nacional de Códigos Postales de Correos de México se ofrece
 * "para uso particular, no estando permitida su comercialización ni su
 * distribución a terceros". Por eso **no se versiona** ni se incluye en la
 * imagen: este script lo descarga del sitio oficial en el momento de cargarlo.
 * Ejecútalo solo si el área jurídica del SIPINNA confirma que el uso es
 * compatible con esos términos (ver docs/seguridad/metodos-proteccion.md).
 *
 * Uso (tarea única de ECS, como borrar-reporte; ver docs/RUNBOOK-AWS.md):
 *   node dist/scripts/cargar-codigos-postales.js --descargar --confirmar
 *   node dist/scripts/cargar-codigos-postales.js ruta/al/cpdescarga.txt --confirmar
 */

/** URL oficial del catálogo en texto (separado por `|`, codificación Latin-1). */
export const URL_CATALOGO = 'https://www.correosdemexico.gob.mx/datosabiertos/cp/cpdescarga.txt';

/** Par código postal → clave INEGI del municipio. */
export interface ParCp {
  codigoPostal: string;
  claveInegi: string;
}

/**
 * Extrae los pares CP → municipio del Estado de México (`c_estado = 15`).
 * La primera línea es la nota legal y la segunda los encabezados de columna.
 */
export function extraerPares(texto: string): ParCp[] {
  const lineas = texto.split(/\r?\n/);
  const columnas = (lineas[1] ?? '').split('|');
  const iCp = columnas.indexOf('d_codigo');
  const iEstado = columnas.indexOf('c_estado');
  const iMunicipio = columnas.indexOf('c_mnpio');
  if (iCp < 0 || iEstado < 0 || iMunicipio < 0) throw new Error('El archivo no tiene el formato esperado de SEPOMEX');
  const vistos = new Set<string>();
  const pares: ParCp[] = [];
  for (const linea of lineas.slice(2)) {
    const c = linea.split('|');
    if (c[iEstado] !== '15' || !/^\d{5}$/.test(c[iCp] ?? '') || !/^\d{3}$/.test(c[iMunicipio] ?? '')) continue;
    const par = { codigoPostal: c[iCp], claveInegi: `15${c[iMunicipio]}` };
    const llave = `${par.codigoPostal}-${par.claveInegi}`;
    if (!vistos.has(llave)) { vistos.add(llave); pares.push(par); }
  }
  return pares;
}

/** Inserta los pares (idempotente) y devuelve cuántos quedaron en la tabla. */
export async function cargar(m: EntityManager, pares: ParCp[]): Promise<number> {
  for (let i = 0; i < pares.length; i += 500) {
    const lote = pares.slice(i, i + 500);
    await m.query(
      `INSERT INTO codigo_postal_municipio (codigo_postal, clave_inegi)
       SELECT * FROM unnest($1::text[], $2::text[]) ON CONFLICT DO NOTHING`,
      [lote.map((p) => p.codigoPostal), lote.map((p) => p.claveInegi)],
    );
  }
  return Number((await m.query('SELECT count(*) AS n FROM codigo_postal_municipio'))[0].n);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (!args.includes('--confirmar')) {
    console.error('Falta --confirmar. Lee la nota de licencia en el encabezado de este script antes de cargar el catálogo.');
    process.exit(2);
  }
  let texto: string;
  if (args.includes('--descargar')) {
    const r = await fetch(URL_CATALOGO, { headers: { 'User-Agent': 'RIETI (carga de códigos postales)' } });
    if (!r.ok) throw new Error(`Correos de México respondió ${r.status}`);
    texto = Buffer.from(await r.arrayBuffer()).toString('latin1');
  } else {
    const ruta = args.find((a) => !a.startsWith('--'));
    if (!ruta) throw new Error('Indica la ruta del archivo o usa --descargar');
    texto = readFileSync(ruta, 'latin1');
  }
  const pares = extraerPares(texto);
  const ds = await new DataSource({ ...opcionesTypeOrm(), migrationsRun: false }).initialize();
  try {
    const total = await ds.transaction((m) => cargar(m, pares));
    console.log(`Códigos postales del Estado de México cargados: ${pares.length} pares leídos; ${total} en la tabla.`);
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  });
}
