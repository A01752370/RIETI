import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { FiltroErrores } from './comun/filtro-errores';

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
  app.use(helmet());

  // Límite de tamaño del cuerpo JSON (DoS, ataque A22).
  app.useBodyParser('json', { limit: '16kb' });

  const origenes = (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (origenes.length > 0) app.enableCors({ origin: origenes });

  // Contrato versionado (RNF-06). /health queda fuera del prefijo porque lo usan el ALB y ECS.
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }, { path: 'health/ready', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new FiltroErrores());
}
