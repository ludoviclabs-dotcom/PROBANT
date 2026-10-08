import 'server-only';
import { getDatabase } from '@/lib/db/client';
import { getRequestAuthorizer } from '@/lib/auth/server';
import { InvestmentRuntime } from './investment-runtime';
import { investmentHandlers } from './investment-http';
export const investmentServer=investmentHandlers(()=>new InvestmentRuntime(getDatabase(),getRequestAuthorizer()));
