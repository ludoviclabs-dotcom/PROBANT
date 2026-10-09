import 'server-only';
import { getDatabase } from '@/lib/db/client';
import { getRequestAuthorizer } from '@/lib/auth/server';
import { ExceptionalRuntime } from './exceptional-runtime';
import { exceptionalHandlers } from './exceptional-http';
export const exceptionalServer = exceptionalHandlers(() => new ExceptionalRuntime(getDatabase(), getRequestAuthorizer()));
