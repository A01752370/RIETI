import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import helmet from 'helmet';
import { join } from 'path';
import { FiltroErrores } from './comun/filtro-errores';

/**
 * CSP estricta (sin CDN, sin fuentes externas, sin estilos ni scripts en línea).
 * La web pública y la del personal se sirven desde este mismo origen.
 */
export const DIRECTIVAS_CSP = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'self'"],
  imgSrc: ["'self'", 'data:'],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  upgradeInsecureRequests: [],
};

/** Prefijos que nunca devuelven la web (API y sondas de salud). */
const RUTAS_DEL_API = /^\/(api|health)(\/|$)/;

/**
 * Sirve la web compilada (`web/dist`) si existe. Los archivos con hash de
 * `/assets` se guardan en caché un año; cualquier otra ruta GET que no sea del
 * API devuelve `index.html` (la web resuelve sus propias rutas).
 */
function servirWeb(app: NestExpressApplication): void {
  const dir = process.env.WEB_DIR ?? join(__dirname, '..', 'web');
  const indice = join(dir, 'index.html');
  if (!existsSync(indice)) return;

  app.useStaticAssets(join(dir, 'assets'), { prefix: '/assets/', immutable: true, maxAge: '365d', index: false });
  app.useStaticAssets(dir, { index: false, maxAge: '1h' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || RUTAS_DEL_API.test(req.path) || !req.accepts('html')) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indice);
  });
}

/**
 * Configuración HTTP del API. Se comparte entre `main.ts` y las pruebas e2e
 * para que lo probado sea exactamente lo que corre en producción.
 *
 * Requiere crear la app con `bodyParser: false` (el parser se registra aquí con límite).
 */
export function configurarApp(app: NestExpressApplication): void {
  // Detrás de CloudFront → ALB: confiar en 2 saltos de X-Forwarded-For para obtener la IP real
  // del cliente (la usa el límite de tasa; no se guarda en ningún lado, RNF-29).
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 2));
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { useDefaults: false, directives: DIRECTIVAS_CSP } }));

  // Límite de tamaño del cuerpo JSON (DoS, ataque A22).
  app.useBodyParser('json', { limit: '16kb' });

  const origenes = (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (origenes.length > 0) app.enableCors({ origin: origenes });

  servirWeb(app);

  // Contrato versionado (RNF-06). /health queda fuera del prefijo porque lo usan el ALB y ECS.
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }, { path: 'health/ready', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new FiltroErrores());
}
