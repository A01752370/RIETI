import { createHmac } from 'crypto';
import { crearVerificadorCognito } from '../src/auth/jwt.guard';

/**
 * Ataque A11: tokens manipulados. Se usa el verificador real de Cognito
 * (`aws-jwt-verify`) con un pool ficticio; ningún token falsificado debe pasar.
 */
describe('verificador de JWT de Cognito', () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const ISS = 'https://cognito-idp.mx-central-1.amazonaws.com/mx-central-1_PRUEBA';
  const claims = {
    sub: '11111111-1111-1111-1111-111111111111', iss: ISS, client_id: 'cliente-prueba', token_use: 'access',
    'cognito:groups': ['Administrador'], exp: Math.floor(Date.now() / 1000) + 3600,
  };

  beforeAll(() => {
    process.env.COGNITO_USER_POOL_ID = 'mx-central-1_PRUEBA';
    process.env.COGNITO_CLIENT_ID = 'cliente-prueba';
  });

  it('rechaza alg:none', async () => {
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims)}.`;
    await expect(crearVerificadorCognito().verify(token)).rejects.toThrow();
  });

  it('rechaza HS256 firmado con un secreto inventado', async () => {
    const cuerpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}`;
    const firma = createHmac('sha256', 'secreto').update(cuerpo).digest('base64url');
    await expect(crearVerificadorCognito().verify(`${cuerpo}.${firma}`)).rejects.toThrow();
  });

  it('rechaza un token de otro pool (emisor distinto)', async () => {
    const cuerpo = `${b64({ alg: 'RS256', kid: 'x', typ: 'JWT' })}.${b64({ ...claims, iss: ISS.replace('PRUEBA', 'OTRO') })}`;
    await expect(crearVerificadorCognito().verify(`${cuerpo}.AAAA`)).rejects.toThrow();
  });

  it('rechaza basura', async () => {
    await expect(crearVerificadorCognito().verify('no-es-un-jwt')).rejects.toThrow();
  });
});
