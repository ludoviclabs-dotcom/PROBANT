interface WindowState {
  count: number;
  resetsAt: number;
}

const windows = new Map<string, WindowState>();
export const MAX_UPLOAD_REQUEST_BYTES = 26 * 1024 * 1024;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export function clientIdentifier(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}

export function requestBodyTooLarge(req: Request): boolean {
  const header = req.headers.get("content-length");
  if (!header) return false;
  const length = Number(header);
  return Number.isFinite(length) && length > MAX_UPLOAD_REQUEST_BYTES;
}

export function consumeRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}): RateLimitResult {
  const now = input.now ?? Date.now();
  const previous = windows.get(input.key);
  const current =
    !previous || previous.resetsAt <= now
      ? { count: 0, resetsAt: now + input.windowMs }
      : previous;
  current.count++;
  windows.set(input.key, current);
  if (windows.size > 5_000) {
    for (const [key, state] of windows) {
      if (state.resetsAt <= now) windows.delete(key);
    }
  }
  return {
    allowed: current.count <= input.limit,
    limit: input.limit,
    remaining: Math.max(0, input.limit - current.count),
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((current.resetsAt - now) / 1_000),
    ),
  };
}

