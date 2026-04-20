import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();
    const request = ctx.getRequest<{ method?: string; url?: string }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const normalized = this.normalizeExceptionResponse(rawResponse, status);

    if (status >= 500) {
      this.logger.error(
        `Unhandled exception on ${request.method ?? "UNKNOWN"} ${request.url ?? "unknown"}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message: normalized.message,
      errors: normalized.errors,
      path: request.url ?? "",
      timestamp: new Date().toISOString(),
    });
  }

  private normalizeExceptionResponse(
    rawResponse: unknown,
    status: number,
  ): { message: string; errors?: string[] } {
    if (!rawResponse) {
      return {
        message:
          status >= 500 ? "Internal server error" : HttpStatus[status] ?? "Request failed",
      };
    }

    if (typeof rawResponse === "string") {
      return { message: rawResponse };
    }

    if (typeof rawResponse === "object") {
      const payload = rawResponse as { message?: unknown; error?: unknown };
      const message = Array.isArray(payload.message)
        ? payload.message[0] ?? "Validation failed"
        : typeof payload.message === "string"
          ? payload.message
          : status >= 500
            ? "Internal server error"
            : "Request failed";

      const errors = Array.isArray(payload.message)
        ? payload.message.map((item) => String(item))
        : undefined;

      return {
        message,
        errors,
      };
    }

    return {
      message: status >= 500 ? "Internal server error" : "Request failed",
    };
  }
}
