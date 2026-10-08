import { DrizzleQueryError } from "drizzle-orm/errors";
import { clientsHandlers } from "../clients-http";
import { describe,expect,it } from "vitest";
import { requireDisposablePayables, payablesHandlers } from "../payables-http";
import { payablesCommandSchema } from "../payables-commands";
import { assertContext,assertPayablesContext } from "../cycle-context";
import { scope,period } from "./payables-fixture";
describe("Mission 08 — activation fermée",()=>{
 it("refuse tout défaut et toute activation en production",()=>{expect(()=>requireDisposablePayables({})).toThrow();expect(()=>requireDisposablePayables({PROBANT_PAYABLES_DURABLE:"true"})).toThrow();expect(()=>requireDisposablePayables({PROBANT_PAYABLES_DURABLE:"disposable",VERCEL_ENV:"production"})).toThrow();expect(()=>requireDisposablePayables({PROBANT_PAYABLES_DURABLE:"disposable",VERCEL_ENV:"preview"})).not.toThrow();});
 it("autorise les seuls adaptateurs déclarés sans ouvrir le contexte synthétique",()=>{const c={scope,period,purpose:"real" as const,procedure:"payables.rpne" as const};expect(()=>assertPayablesContext(c)).not.toThrow();expect(()=>assertContext(c)).toThrow();expect(()=>assertPayablesContext({...c,procedure:"clients.sales"})).toThrow();});
 it("refuse un rôle, un auteur et une commande d’un autre cycle",()=>{expect(payablesCommandSchema.safeParse({command:"create",period,instanceKey:"forged"}).success).toBe(false);expect(payablesCommandSchema.safeParse({command:"execute",id:"run",expectedVersion:1,role:"reviewer"}).success).toBe(false);expect(payablesCommandSchema.safeParse({command:"review",id:"run",expectedVersion:1,decision:"approved",text:"ok",submittedHash:"a".repeat(64),actorId:"reviewer"}).success).toBe(false);});
 it("ne divulgue pas les requêtes ou paramètres du pilote de base",async()=>{const create=()=>{throw new DrizzleQueryError("INSERT INTO confidential VALUES ($1) ON CONFLICT",["private-source-value"],new Error("constraint failed"));};const request=new Request("https://probant.example.test/api/workpapers/payables?dossierId=11111111-1111-4111-8111-111111111111&periodId=p");for(const handlers of [payablesHandlers(create,()=>{}),clientsHandlers(create,()=>{})]){const r=await handlers.GET(request);expect(r.status).toBe(503);expect(await r.text()).not.toContain("private-source-value");}});
});
