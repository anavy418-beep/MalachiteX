import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { join } from "node:path";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";
import { AppModule } from "./app.module";

function normalizeOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === "*") return "*";

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function parseOriginList(value?: string) {
  if (!value) return [];
  return value
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
}

function toVercelProjectSlug(origin: string) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    if (!hostname.endsWith(".vercel.app")) {
      return "";
    }

    return hostname.replace(/\.vercel\.app$/, "");
  } catch {
    return "";
  }
}

function isAllowedVercelPreviewOrigin(origin: string, slugs: Set<string>) {
  if (slugs.size === 0) {
    return false;
  }

  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    if (!hostname.endsWith(".vercel.app")) {
      return false;
    }

    for (const slug of slugs) {
      if (!slug) continue;
      if (hostname === `${slug}.vercel.app` || hostname.startsWith(`${slug}-`)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function bootstrap() {
  const productionDefaultOrigins = [
    "https://malachitex-web.vercel.app",
    "https://xorviqa-web.vercel.app",
  ];
  const configuredOrigins = [
    ...parseOriginList(process.env.CORS_ORIGIN),
    ...parseOriginList(process.env.FRONTEND_URL),
  ];
  const fallbackOrigins = process.env.NODE_ENV === "production"
    ? productionDefaultOrigins
    : ["http://localhost:3000"];
  const mergedOrigins = configuredOrigins.length > 0
    ? [...configuredOrigins, ...fallbackOrigins]
    : fallbackOrigins;

  const vercelOrigin = process.env.VERCEL_URL
    ? normalizeOrigin(`https://${process.env.VERCEL_URL}`)
    : "";
  const allowAnyOrigin = mergedOrigins.includes("*");

  const allowedOriginSet = new Set(
    (vercelOrigin ? [...mergedOrigins, vercelOrigin] : mergedOrigins).filter((origin) => origin !== "*"),
  );
  const allowVercelPreviewOrigins = process.env.ALLOW_VERCEL_PREVIEW_ORIGINS !== "false";
  const allowedVercelProjectSlugs = new Set(
    [...allowedOriginSet]
      .map((origin) => toVercelProjectSlug(origin))
      .filter(Boolean),
  );

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (allowAnyOrigin) {
          callback(null, true);
          return;
        }

        if (allowedOriginSet.has(normalizeOrigin(origin))) {
          callback(null, true);
          return;
        }

        if (
          allowVercelPreviewOrigins &&
          isAllowedVercelPreviewOrigin(normalizeOrigin(origin), allowedVercelProjectSlugs)
        ) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
      credentials: true,
    },
  });

  app.set("trust proxy", 1);
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.useStaticAssets(join(process.cwd(), "uploads"), { prefix: "/uploads/" });
  app.useGlobalFilters(new ApiExceptionFilter());
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
      .setTitle("Xorviqa API")
      .setDescription("Xorviqa MVP API (demo-ready wallet + P2P platform)")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");

  const apiBase = await app.getUrl();
  console.log(`[Xorviqa API] listening at ${apiBase}/api`);
  if (enableSwagger) {
    console.log(`[Xorviqa API] docs at ${apiBase}/api/docs`);
  }
}

bootstrap();
