import 'reflect-metadata';
import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  Module,
  ValidationPipe,
  Controller,
  Get,
  type INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder, type OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Db } from './db';
import { errorBody, errorStatus } from './errors';
import {
  DatabaseModule,
  AuthModule,
  CatalogModule,
  MediaModule,
  LearningModule,
  AdminModule,
} from './modules';
@Controller('health')
class HealthController {
  constructor(private db: Db) {}
  @Get() async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok', version: '0.6.0', release: process.env.RELEASE_TAG ?? 'source' };
  }
}
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const status = error instanceof HttpException ? error.getStatus() : errorStatus(error);
    const body = error instanceof HttpException ? error.getResponse() : errorBody(error);
    res.status(status).json({
      ...(typeof body === 'object' ? body : { message: body }),
      requestId: res.getHeader('X-Request-ID'),
    });
  }
}
@Module({
  imports: [DatabaseModule, AuthModule, CatalogModule, MediaModule, LearningModule, AdminModule],
  controllers: [HealthController],
})
export class AppModule {}
/** Exact paths of the optional HTTP docs (Swagger UI and its OpenAPI JSON). */
export const API_DOCS_PATH = 'api/v1/docs';
export const API_DOCS_JSON_PATH = 'api/v1/openapi.json';
/**
 * The docs list every /admin/* and /manager/* route, so the running API serves them only when
 * EXPOSE_API_DOCS is exactly "true" (default off; never on for a public deployment).
 */
export const apiDocsEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  env.EXPOSE_API_DOCS === 'true';
/** The OpenAPI contract (docs/api/openapi.json); building it registers no HTTP route. */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Seafood Deck API')
      .setVersion('1')
      .addCookieAuth('seafoodeck_session')
      .build(),
  );
}
/** The configured API application (not listening yet). */
export async function createApp(env: NodeJS.ProcessEnv = process.env): Promise<INestApplication> {
  const server = express();
  server.disable('x-powered-by');
  // API is private behind exactly one Caddy hop; do not group every learner under its IP.
  server.set('trust proxy', 1);
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
    const requestId = randomUUID(),
      started = Date.now();
    res.setHeader('X-Request-ID', requestId);
    res.on('finish', () =>
      console.log(
        JSON.stringify({
          requestId,
          method: _req.method,
          path: _req.path,
          status: res.statusCode,
          ms: Date.now() - started,
        }),
      ),
    );

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new Errors());
  if (apiDocsEnabled(env))
    SwaggerModule.setup(API_DOCS_PATH, app, buildOpenApiDocument(app), {
      jsonDocumentUrl: API_DOCS_JSON_PATH,
    });
  return app;
}
async function main() {
  await mkdir('/tmp/seafoodeck-upload', { recursive: true });
  if (process.env.EXPORT_OPENAPI) {
    // Contract export: never registers the docs routes, whatever EXPOSE_API_DOCS says.
    const app = await createApp({ ...process.env, EXPOSE_API_DOCS: undefined });
    const document = buildOpenApiDocument(app);
    await writeFile(process.env.EXPORT_OPENAPI, JSON.stringify(document, null, 2) + '\n');
    await app.close();
    return;
  }
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}
if (require.main === module)
  main().catch(() => {
    console.error('API startup failed; check database/environment configuration.');
    process.exit(1);
  });
