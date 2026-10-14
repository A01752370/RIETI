#!/usr/bin/env node
/**
 * Genera `src/database/datos/municipios-edomex-geom.ts` con los polígonos de los
 * 125 municipios del Estado de México, para validar que el punto de un reporte
 * cae dentro del municipio elegido (Fase 2).
 *
 * Fuente: INEGI, Marco Geoestadístico, servicio `wscatgeo/v2/geo/mgem/15`
 * (información pública). Las geometrías se simplifican con Douglas-Peucker
 * (tolerancia ≈ 20 m) para que el archivo sea manejable; la validación del API
 * tolera además 300 m alrededor del límite, así que la simplificación no
 * rechaza puntos legítimos cerca de la frontera.
 *
 * Uso (desde backend/):
 *   node scripts/generar-geom-municipios.mjs              # descarga de INEGI
 *   node scripts/generar-geom-municipios.mjs archivo.json # usa un GeoJSON ya descargado
 *
 * Es reproducible: con la misma fuente produce el mismo archivo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_INEGI = 'https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgem/15';
const TOLERANCIA_GRADOS = 0.0002; // ≈ 20 m en la latitud del Estado de México
const DECIMALES = 5;              // ≈ 1 m
const SALIDA = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'database', 'datos', 'municipios-edomex-geom.ts');

/** Distancia al cuadrado de p al segmento a-b (en grados; suficiente para simplificar). */
function distanciaSegmento2([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const largo2 = dx * dx + dy * dy;
  let t = largo2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / largo2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx - px;
  const y = ay + t * dy - py;
  return x * x + y * y;
}

/** Douglas-Peucker iterativo (sin recursión, para anillos largos). */
function simplificar(puntos, tolerancia) {
  if (puntos.length <= 4) return puntos;
  const conservar = new Uint8Array(puntos.length);
  conservar[0] = conservar[puntos.length - 1] = 1;
  const pila = [[0, puntos.length - 1]];
  const tol2 = tolerancia * tolerancia;
  while (pila.length) {
    const [ini, fin] = pila.pop();
    let maxD = 0;
    let indice = -1;
    for (let i = ini + 1; i < fin; i++) {
      const d = distanciaSegmento2(puntos[i], puntos[ini], puntos[fin]);
      if (d > maxD) { maxD = d; indice = i; }
    }
    if (indice !== -1 && maxD > tol2) {
      conservar[indice] = 1;
      pila.push([ini, indice], [indice, fin]);
    }
  }
  return puntos.filter((_, i) => conservar[i]);
}

/** Simplifica un anillo cerrado conservando el cierre y al menos 4 puntos. */
function simplificarAnillo(anillo) {
  const r = simplificar(anillo, TOLERANCIA_GRADOS).map(([x, y]) => [Number(x.toFixed(DECIMALES)), Number(y.toFixed(DECIMALES))]);
  if (r.length < 4) return anillo.map(([x, y]) => [Number(x.toFixed(DECIMALES)), Number(y.toFixed(DECIMALES))]);
  const [x0, y0] = r[0];
  const [xn, yn] = r[r.length - 1];
  if (x0 !== xn || y0 !== yn) r.push([x0, y0]);
  return r;
}

async function leerFuente() {
  const archivo = process.argv[2];
  if (archivo) return JSON.parse(readFileSync(archivo, 'utf8'));
  const r = await fetch(URL_INEGI, { headers: { 'User-Agent': 'RIETI (generador de geometrías municipales)' } });
  if (!r.ok) throw new Error(`INEGI respondió ${r.status}`);
  return r.json();
}

const fuente = await leerFuente();
if (fuente.features?.length !== 125) throw new Error(`Se esperaban 125 municipios y llegaron ${fuente.features?.length}`);

let antes = 0;
let despues = 0;
const geometrias = {};
for (const f of [...fuente.features].sort((a, b) => a.properties.cvegeo.localeCompare(b.properties.cvegeo))) {
  const { cvegeo } = f.properties;
  const g = f.geometry;
  const poligonos = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
  const simplificados = poligonos.map((p) => p.map((anillo) => {
    antes += anillo.length;
    const s = simplificarAnillo(anillo);
    despues += s.length;
    return s;
  }));
  geometrias[cvegeo] = JSON.stringify({ type: 'MultiPolygon', coordinates: simplificados });
}

const encabezado = `/* eslint-disable */
/**
 * Polígonos de los 125 municipios del Estado de México (GeoJSON MultiPolygon, EPSG:4326).
 *
 * Fuente: INEGI, Marco Geoestadístico (${fuente.metadatos?.Fuente_informacion_vectorial ?? 'wscatgeo/v2/geo/mgem/15'}).
 * Generado con backend/scripts/generar-geom-municipios.mjs; no se edita a mano.
 * Simplificado con Douglas-Peucker (tolerancia ${TOLERANCIA_GRADOS}°, ≈ 20 m): ${antes} → ${despues} puntos.
 */
export const FUENTE_GEOM_MUNICIPIOS = ${JSON.stringify(fuente.metadatos?.Fuente_informacion_vectorial ?? 'INEGI, Marco Geoestadístico')};

/** Clave INEGI (15xxx) → geometría GeoJSON en texto (se pasa tal cual a ST_GeomFromGeoJSON). */
export const GEOM_MUNICIPIOS_EDOMEX: Readonly<Record<string, string>> = {
`;
const cuerpo = Object.entries(geometrias).map(([k, v]) => `  '${k}': '${v}',`).join('\n');
writeFileSync(SALIDA, `${encabezado}${cuerpo}\n};\n`, 'utf8');
console.log(`Escrito ${SALIDA}: ${Object.keys(geometrias).length} municipios, ${antes} → ${despues} puntos`);
