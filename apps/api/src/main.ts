import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { join } from "node:path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });

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

  await app.listen(process.env.API_PORT ? Number(process.env.API_PORT) : 4000);
}

bootstrap();
