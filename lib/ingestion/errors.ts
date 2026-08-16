import { NextResponse } from "next/server";
import type { StructuredApiError } from "./types";

export function requestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<StructuredApiError> {
  return NextResponse.json(
    {
      code,
      message,
      details,
      requestId: requestId(),
    },
    { status },
  );
}

