import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

/**
 * Contraseña de la BD. En AWS viene del secreto que RDS gestiona y rota
 * (`DB_SECRET_ARN`); se cachea 5 min para no consultar Secrets Manager en cada
 * conexión del pool, y así una rotación se recoge sin reiniciar la tarea.
 * En local se usa `DB_PASSWORD`.
 */
const TTL_MS = 5 * 60 * 1000;
let cache: { valor: string; expira: number } | null = null;
let cliente: SecretsManagerClient | null = null;

export async function obtenerPasswordBd(): Promise<string> {
  const arn = process.env.DB_SECRET_ARN;
  if (!arn) return process.env.DB_PASSWORD ?? '';
  if (cache && cache.expira > Date.now()) return cache.valor;

  cliente ??= new SecretsManagerClient({});
  const { SecretString } = await cliente.send(new GetSecretValueCommand({ SecretId: arn }));
  const { password } = JSON.parse(SecretString ?? '{}') as { password?: string };
  if (!password) throw new Error('El secreto de la BD no contiene "password"');
  cache = { valor: password, expira: Date.now() + TTL_MS };
  return password;
}

/** Fuerza a releer el secreto (p. ej. tras un error de autenticación por rotación). */
export function invalidarPasswordBd(): void {
  cache = null;
}
