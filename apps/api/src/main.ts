import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { join } from "node:path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const rawCorsOrigins =
    process.env.CORS_ORIGIN ??
    process.env.FRONTEND_URL ??
    "http://localhost:3000,https://malachitex-web.vercel.app";

  const allowedOrigins = rawCorsOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("CORS origin blocked"), false);
      },
      credentials: true,
    },
  });

  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.useStaticAssets(join(process.cwd(), "uploads"), { prefix: "/uploads/" });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const enableSwagger = process.env.SWAGGER_ENABLED !== "false";

  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle("Malachitex API")
      .setDescription("Malachitex MVP API (demo-ready wallet + P2P platform)")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");

  const apiBase = await app.getUrl();
  console.log(`[Malachitex API] listening at ${apiBase}/api`);
  if (enableSwagger) {
    console.log(`[Malachitex API] docs at ${apiBase}/api/docs`);
  }
}

bootstrap();
