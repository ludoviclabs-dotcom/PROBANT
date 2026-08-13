import { NextResponse } from "next/server";

export interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string;
  retryable: boolean;
  details?: Record<string, string | number | boolean | null>;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
    readonly details?: Record<string, string | number | boolean | null>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function requestIdFrom(request: Request): string {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && /^[A-Za-z0-9._:-]{1,128}$/u.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

export function apiErrorResponse(error: unknown, requestId: string): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        code: error.code,
        message: error.message,
        requestId,
        retryable: error.retryable,
        ...(error.details ? { details: error.details } : {}),
      },
      { status: error.status, headers: { "x-request-id": requestId } },
    );
  }

  console.error(
    JSON.stringify({
      level: "error",
      code: "INTERNAL_ERROR",
      requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  return NextResponse.json(
    {
      code: "INTERNAL_ERROR",
      message: "Une erreur interne est survenue.",
      requestId,
      retryable: true,
    },
    { status: 500, headers: { "x-request-id": requestId } },
  );
}
