import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Detrás de CloudFront → ALB: confiar en 2 saltos de X-Forwarded-For para obtener la IP real
  // del cliente (la usa el rate limiting).
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 2));
  app.disable('x-powered-by');
  app.use(helmet());

  const origenes = (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (origenes.length > 0) app.enableCors({ origin: origenes });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  const puerto = Number(process.env.PORT ?? 3000);
  await app.listen(puerto, '0.0.0.0');
  new Logger('Bootstrap').log(`API escuchando en el puerto ${puerto}`);
}

bootstrap();
