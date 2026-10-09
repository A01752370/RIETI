import { generarClave, hashearClave, normalizarClave, verificarClave } from '../src/reportes/clave-consulta';

describe('clave de consulta', () => {
  it('tiene formato XXXX-XXXX-XXXX sin caracteres ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      expect(generarClave()).toMatch(/^[2-9A-HJ-KM-NP-Z]{4}-[2-9A-HJ-KM-NP-Z]{4}-[2-9A-HJ-KM-NP-Z]{4}$/);
    }
  });

  it('no se repite en 2 000 generaciones', () => {
    const claves = new Set(Array.from({ length: 2000 }, generarClave));
    expect(claves.size).toBe(2000);
  });

  it('se guarda como hash Argon2id en formato PHC, nunca en claro', async () => {
    const clave = generarClave();
    const hash = await hashearClave(clave);
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    expect(hash).not.toContain(normalizarClave(clave));
  });

  it('dos hashes de la misma clave son distintos (sal aleatoria)', async () => {
    const clave = generarClave();
    expect(await hashearClave(clave)).not.toBe(await hashearClave(clave));
  });

  it('verifica la clave correcta, aunque venga en minúsculas o con espacios', async () => {
    const clave = generarClave();
    const hash = await hashearClave(clave);
    expect(await verificarClave(clave, hash)).toBe(true);
    expect(await verificarClave(` ${clave.toLowerCase().replace(/-/g, ' ')} `, hash)).toBe(true);
  });

  it('rechaza una clave incorrecta', async () => {
    const hash = await hashearClave(generarClave());
    expect(await verificarClave(generarClave(), hash)).toBe(false);
  });

  it('rechaza sin lanzar si el hash falta o está mal formado', async () => {
    expect(await verificarClave('ABCD-EFGH-JKMN', null)).toBe(false);
    expect(await verificarClave('ABCD-EFGH-JKMN', '')).toBe(false);
    expect(await verificarClave('ABCD-EFGH-JKMN', '$bcrypt$x')).toBe(false);
  });
});
