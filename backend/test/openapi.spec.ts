import { readFileSync } from 'fs';
import { join } from 'path';
import { todasLasRutas } from './utilidades/rutas';

/** Rutas que quedan fuera del prefijo global `/api/v1` (ver `configurar-app.ts`). */
const SIN_PREFIJO = new Set(['health', 'health/ready']);

/** `reportes/:id` → `/api/v1/reportes/{id}`. */
function aOpenApi(ruta: string): string {
  const conParametros = ruta.replace(/:([A-Za-z]+)/g, '{$1}');
  return SIN_PREFIJO.has(ruta) ? `/${conParametros}` : `/api/v1/${conParametros}`;
}

/**
 * `docs/api/openapi.json` se mantiene a mano. Esta prueba falla si una ruta del
 * código no aparece en el contrato, o si el contrato documenta una ruta que ya no existe.
 */
describe('contrato OpenAPI', () => {
  const doc = JSON.parse(readFileSync(join(__dirname, '..', '..', 'docs', 'api', 'openapi.json'), 'utf8')) as {
    paths: Record<string, Record<string, unknown>>;
  };
  const VERBOS = ['get', 'post', 'put', 'patch', 'delete'];

  const enContrato = Object.entries(doc.paths)
    .flatMap(([ruta, ops]) => Object.keys(ops).filter((v) => VERBOS.includes(v)).map((v) => `${v.toUpperCase()} ${ruta}`))
    .sort();
  const enCodigo = todasLasRutas().map((r) => `${r.verbo} ${aOpenApi(r.ruta)}`).sort();

  it('documenta exactamente las rutas que expone el código', () => {
    expect(enContrato).toEqual(enCodigo);
  });
});
