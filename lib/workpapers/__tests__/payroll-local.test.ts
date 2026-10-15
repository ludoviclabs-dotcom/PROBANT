import { durableChainEnabled, executionProfile } from "@/lib/runtime/profile";
import { expect, it } from "vitest";
import { PayrollRuntime } from "../payroll-runtime";
import { payrollActor, payrollFixture } from "../payroll-fixture";
import { MemoryImportRepository } from "../imports";
import { payrollObservation } from "../payroll-observation";
it("une déclaration amendée périme septembre seulement, sans toucher octobre ni les congés", async()=>{
 const r=await PayrollRuntime.create();
 const fixture=payrollFixture();
 // Remove repeated payment for this documentation case; repetition has its own blocking test.
 let p=await r.preview(payrollActor,new File([(await fixture.files.payments.text()).split("\n").filter(l=>!l.startsWith("P3;")).join("\n")],"paiements.csv"),fixture.mapping("payments"));
 await r.command(payrollActor,{action:"approve_import",version:p.version,previewId:p.previewId,previewHash:p.previewHash});
 for(const month of ["2026-09","2026-10"]){const v=r.read(payrollActor),g=v.settlements.groups.find(g=>g.month===month&&g.rubric==="SOC")!;await r.command(payrollActor,{action:"document",version:v.version,module:"settlements",targetId:g.id,inputHash:g.inputHash,reason:g.evidence[0].reason,evidenceId:g.evidence[0].id});}
 const before=r.read(payrollActor);
 expect(before.settlements.groups.find(g=>g.month==="2026-09"&&g.rubric==="SOC")?.status).toBe("documented");
 p=await r.preview(payrollActor,new File([(await fixture.files.declaration.text()).replace(";50.00;2026-09", ";51.00;2026-09")],"declaration.csv"),fixture.mapping("declaration"));
 const after=await r.command(payrollActor,{action:"approve_import",version:p.version,previewId:p.previewId,previewHash:p.previewHash});
 expect(after.settlements.groups.find(g=>g.month==="2026-09"&&g.rubric==="SOC")?.status).toBe("stale");
 expect(after.settlements.groups.find(g=>g.month==="2026-10"&&g.rubric==="SOC")?.status).toBe("documented");
 expect(after.leave).toEqual(before.leave);
});
it("archive restaurée : contexte, décisions, sources et versions conservés",async()=>{
 expect(durableChainEnabled({PROBANT_PAYROLL_DURABLE:"disposable"},"PROBANT_PAYROLL_DURABLE")).toBe(false);
 expect(executionProfile({PROBANT_PAYROLL_DURABLE:"disposable"})).toBe("browser_demo");
 const runtime=await PayrollRuntime.create();const before=runtime.read(payrollActor);
 const archive=await runtime.archive(payrollActor);const restored=PayrollRuntime.restore(archive,new MemoryImportRepository());
 const after=restored.read(payrollActor);expect({...after,mode:before.mode}).toEqual(before);
 const observation=payrollObservation(archive.state,false);
 expect(JSON.stringify(observation.result)).not.toContain("SYN-A01");
 expect(JSON.stringify(observation.result)).not.toContain("50.00");
});

it("une base absente bloque seulement le groupe concerné, sans devenir zéro",async()=>{
 const r=await PayrollRuntime.create(),fixture=payrollFixture();const [header,...rows]=(await fixture.files.ledger.text()).split("\n");const keys=header.split(";");
 const text=[header,...rows.map(line=>{const values=line.split(";");if(values[keys.indexOf("month")]==="2026-09"&&values[keys.indexOf("rubric")]==="SOC")values[keys.indexOf("base")]="";return values.join(";")})].join("\n");
 const p=await r.preview(payrollActor,new File([text],"ledger.csv"),fixture.mapping("ledger"));const v=await r.command(payrollActor,{action:"approve_import",version:p.version,previewId:p.previewId,previewHash:p.previewHash});
 expect(v.framing.groups.find(g=>g.month==="2026-09"&&g.rubric==="SOC")?.delta.kind).toBe("unknown");expect(v.framing.groups.find(g=>g.month==="2026-10"&&g.rubric==="SOC")?.delta.kind).toBe("known");
 expect(v.settlements.groups.find(g=>g.month==="2026-09"&&g.rubric==="SOC")?.glDelta.kind).toBe("unknown");
});
