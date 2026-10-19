import { DataSource, EntityManager } from 'typeorm';

/**
 * Parámetros editables por el Administrador (tabla `configuracion`, Fase 7): radios y
 * ventanas de duplicados y alertas, y conservación de la bitácora de accesos.
 *
 * @param respaldo valor si la clave no existe (p. ej. antes de la migración)
 */
export async function configuracion(ds: DataSource | EntityManager, clave: string, respaldo: number): Promise<number> {
  const [fila] = await ds.query('SELECT valor FROM configuracion WHERE clave = $1', [clave]);
  return fila ? Number(fila.valor) : respaldo;
}
