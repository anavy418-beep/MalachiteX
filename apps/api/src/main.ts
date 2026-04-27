import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { join } from "node:path";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";
import { AppModule } from "./app.module";

type SendMimeModule = {
  mime?: {
    charsets?: {
      lookup?: (contentType: string) => string | false;
    };
    [key: string]: unknown;
  };
};

type ExpressResponsePrototype = {
  set: (field: string | Record<string, unknown>, value?: unknown) => unknown;
  header: (field: string | Record<string, unknown>, value?: unknown) => unknown;
};

function resolveRuntimeModulePath(moduleName: string) {
  const workspaceRoot = join(__dirname, "../../../..");
  const searchRoots = [
    process.cwd(),
    workspaceRoot,
    join(workspaceRoot, "apps/api"),
  ];
  const searchPaths = searchRoots.flatMap((root) => [
    root,
    join(root, "node_modules"),
    join(root, "node_modules/.pnpm/node_modules"),
  ]);

  for (const searchPath of searchPaths) {
    try {
      return require.resolve(moduleName, { paths: [searchPath] });
    } catch {
      // try next search path
    }
  }

  throw new Error(`Unable to resolve runtime module: ${moduleName}`);
}

function patchLegacyMimeCharsetLookup() {
  try {
    const sendModulePath = resolveRuntimeModulePath("send");
    const sendModule = require(sendModulePath) as SendMimeModule;
    if (sendModule.mime?.charsets?.lookup) {
      return;
    }

    const mimeTypesPath = resolveRuntimeModulePath("mime-types");
    const mimeTypes = require(mimeTypesPath) as {
      charset?: (contentType: string) => string | false;
    };

    const lookup = (contentType: string) => {
      const resolved = mimeTypes.charset?.(contentType);
      return typeof resolved === "string" ? resolved : false;
    };

    sendModule.mime = {
      ...(sendModule.mime ?? {}),
      charsets: {
        ...(sendModule.mime?.charsets ?? {}),
        lookup,
      },
    };
  } catch {
    // Runtime compatibility patch only; ignore when dependency structure differs.
  }
}

function patchExpressResponseCharsetHandling() {
  try {
    const responseModulePath = resolveRuntimeModulePath("express/lib/response");
    const mimeTypesPath = resolveRuntimeModulePath("mime-types");
    const responsePrototype = require(responseModulePath) as ExpressResponsePrototype;
    const mimeTypes = require(mimeTypesPath) as {
      charset?: (contentType: string) => string | false;
    };

    const patchedSet = function patchedSet(
      this: { setHeader: (field: string, value: string | string[]) => void; set: ExpressResponsePrototype["set"] },
      field: string | Record<string, unknown>,
      val?: unknown,
    ) {
      if (arguments.length === 2) {
        const fieldName = String(field);
        let value = Array.isArray(val) ? val.map(String) : String(val);

        if (fieldName.toLowerCase() === "content-type") {
          if (Array.isArray(value)) {
            throw new TypeError("Content-Type cannot be set to an Array");
          }
          if (!/;\s*charset=/i.test(value)) {
            const charset = mimeTypes.charset?.(value.split(";")[0] ?? "");
            if (typeof charset === "string" && charset.length > 0) {
              value = `${value}; charset=${charset.toLowerCase()}`;
            }
          }
        }

        this.setHeader(fieldName, value);
      } else {
        for (const [key, currentValue] of Object.entries(field)) {
          this.set(key, currentValue);
        }
      }

      return this;
    };

    responsePrototype.set = patchedSet;
    responsePrototype.header = patchedSet;
  } catch {
    // Runtime compatibility patch only; ignore when dependency structure differs.
  }
}

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
  patchLegacyMimeCharsetLookup();
  patchExpressResponseCharsetHandling();

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
