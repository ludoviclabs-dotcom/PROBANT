import { stableSha256 } from "@/lib/synthesis/canonical";
import { periodIssues } from "@/lib/canonical-model/period";
import { MemoryImportRepository } from "./imports";
import { assertScope, frozen, periodId } from "./model";
import {
  authorizePayroll,
  commandSchema,
  payrollKinds,
  type HRPrincipal,
  type PayrollCommand,
  type PayrollMapping,
  type PayrollSource,
  type PayrollState,
} from "./payroll-contract";
import { previewPayroll } from "./payroll-import";
import {
  buildPayrollFraming,
  events,
  payrollInputHash,
  payrollPopulation,
} from "./payroll-framing";
import { buildPayrollSettlements } from "./payroll-settlements";
import { buildPayrollLeave } from "./payroll-leave";
import {
  payrollActor,
  payrollFixture,
  payrollPeriod,
  payrollScope,
} from "./payroll-fixture";
interface Preview {
  source: PayrollSource;
  file: File;
  version: number;
  created: number;
  hash: string;
  actorId: string;
}
export interface PayrollArchive {
  state: PayrollState;
  history: PayrollState[];
  audit: { action: string; version: number; at: string }[];
  previews: { id: string; source: PayrollSource; original: string; version: number; created: number; hash: string; actorId: string }[];
}
export interface PayrollImportPort {
  approveAndSave: MemoryImportRepository["approveAndSave"];
}
export class PayrollRuntime {
  private imports: PayrollImportPort = new MemoryImportRepository();
  private previews = new Map<string, Preview>();
  private history: PayrollState[] = [];
  private tail: Promise<void> = Promise.resolve();
  /** Only action/module/version metadata, never request payloads, names, pseudonyms or amounts. */
  private audit: {
    action: string;
    version: number;
    at: string;
  }[] = [];
  constructor(
    private state: PayrollState,
    private clock: () => number = Date.now,
    private durable = false,
  ) {
    if (
      periodIssues(state.period).length ||
      periodId(state.period) !== state.scope.periodId ||
      (state.scope.mode !== "demo" && !durable)
    )
      throw Error("HR_SCOPE_INVALID");
    this.state = frozen(state);
  }
  static restore(archive: PayrollArchive, imports: PayrollImportPort, clock: () => number = Date.now) {
    const runtime = new PayrollRuntime(archive.state, clock, true);
    runtime.imports = imports;
    runtime.history = archive.history;
    runtime.audit = archive.audit;
    for (const p of archive.previews) runtime.previews.set(p.id, { ...p, file: new File([Buffer.from(p.original, "base64")], "source-synthetique.csv", { type: "text/csv" }) });
    return runtime;
  }
  async archive(actor: HRPrincipal): Promise<PayrollArchive> {
    this.check(actor, "read");
    return { state: this.state, history: this.history, audit: this.audit, previews: await Promise.all([...this.previews].map(async ([id, p]) => ({ id, source: p.source, original: Buffer.from(await p.file.arrayBuffer()).toString("base64"), version: p.version, created: p.created, hash: p.hash, actorId: p.actorId }))) };
  }
  static async create(scenario = "standard") {
    const runtime = new PayrollRuntime({
      scope: payrollScope,
      period: payrollPeriod,
      version: 1,
      sources: {},
      exclusions: [],
      reviews: [],
    });
    if (scenario === "empty") return runtime;
    const fixture = payrollFixture(scenario);
    for (const kind of payrollKinds) {
      const file = fixture.files[kind],
        source = await previewPayroll(
          file,
          payrollScope,
          fixture.mapping(kind),
          payrollActor,
        ),
        batch = await runtime.imports.approveAndSave(
          source.batch,
          file,
          payrollActor,
          source.batch.previewHash,
          "2027-02-01T10:00:00Z",
        );
      runtime.state = frozen({
        ...runtime.state,
        sources: { ...runtime.state.sources, [kind]: { ...source, batch } },
      });
    }
    return runtime;
  }
  private check(
    actor: HRPrincipal | null,
    permission: "read" | "prepare" | "export",
  ) {
    authorizePayroll(actor, this.state.scope, permission);
  }
  private async locked<T>(body: () => Promise<T> | T): Promise<T> {
    const before = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => (release = r));
    await before;
    try {
      return await body();
    } finally {
      release();
    }
  }
  read(actor: HRPrincipal | null) {
    this.check(actor, "read");
    const state = this.state;
    for (const source of Object.values(state.sources)) {
      assertScope(state.scope, source.batch.scope);
    }
    return frozen({
      version: state.version,
      mode: this.durable ? "personal_local" as const : "synthetic" as const,
      period: state.period,
      framing: buildPayrollFraming(state),
      settlements: buildPayrollSettlements(state),
      leave: buildPayrollLeave(state),
      sources: payrollKinds.map((kind) => ({
        kind,
        available: !!state.sources[kind],
        mapping: state.sources[kind]?.mapping ?? null,
        hash: state.sources[kind]?.batch.document.byteHash ?? null,
        documentVersion: state.sources[kind]?.batch.document.id ?? null,
      })),
      reviews: state.reviews,
      history: this.history.map((s) => ({
        version: s.version,
        framingHash: payrollInputHash(s, "framing"),
        settlementsHash: payrollInputHash(s, "settlements"),
        leaveHash: payrollInputHash(s, "leave"),
      })),
      audit: this.audit,
    });
  }
  async preview(actor: HRPrincipal, file: File, mapping: PayrollMapping) {
    this.check(actor, "prepare");
    const version = this.state.version,
      source = await previewPayroll(
        file,
        this.state.scope,
        { ...mapping, qualified: false },
        actor,
      ),
      hash = stableSha256(source),
      id = stableSha256({ hash, version, actor: actor.id });
    for (const [k, v] of this.previews)
      if (this.clock() - v.created > 600000) this.previews.delete(k);
    if (this.previews.size >= 8) throw Error("HR_PREVIEW_LIMIT");
    this.previews.set(id, {
      source,
      file,
      version,
      created: this.clock(),
      hash,
      actorId: actor.id,
    });
    return {
      previewId: id,
      previewHash: hash,
      version,
      kind: mapping.kind,
      rows: source.batch.rows.length,
      coverage: mapping.coverage,
      fields: Object.keys(source.batch.rows[0]?.original ?? {}),
    };
  }
  command(actor: HRPrincipal, command: PayrollCommand) {
    return this.locked(async () => {
      this.check(actor, "prepare");
      this.check(actor, "read");
      const c = commandSchema.parse(command),
        state = this.state;
      if (c.version !== state.version) throw Error("HR_VERSION_CONFLICT");
      let next: PayrollState;
      if (c.action === "approve_import") {
        const p = this.previews.get(c.previewId);
        if (
          !p ||
          p.version !== state.version ||
          p.hash !== c.previewHash ||
          p.actorId !== actor.id ||
          this.clock() - p.created > 600000
        )
          throw Error("HR_PREVIEW_STALE");
        const batch = await this.imports.approveAndSave(
          p.source.batch,
          p.file,
          actor,
          p.source.batch.previewHash,
          new Date(this.clock()).toISOString(),
        );
        const source = {
          mapping: { ...p.source.mapping, qualified: true },
          batch,
        };
        if (batch.document.documentType !== "payroll_" + source.mapping.kind)
          throw Error("HR_SOURCE_KIND_INVALID");
        next = {
          ...state,
          sources: { ...state.sources, [source.mapping.kind]: source },
        };
        this.previews.delete(c.previewId);
      } else if (c.action === "document") {
        const results =
            c.module === "framing"
              ? buildPayrollFraming(state)
              : buildPayrollSettlements(state),
          group = results.groups.find((g) => g.id === c.targetId),
          proof = group?.evidence.find((e) => e.id === c.evidenceId);
        if (group?.inputHash !== c.inputHash && results.inputHash !== c.inputHash) throw Error("HR_REVIEW_STALE");
        if (
          !group ||
          !proof ||
          proof.reason !== c.reason ||
          group.status === "blocked"
        )
          throw Error("HR_EVIDENCE_REQUIRED");
        next = {
          ...state,
          reviews: [
            ...state.reviews.filter(
              (x) => x.module !== c.module || x.targetId !== c.targetId,
            ),
            {
              module: c.module,
              targetId: c.targetId,
              inputHash: group.inputHash,
              reason: c.reason,
              evidenceId: c.evidenceId,
              authorId: actor.id,
              at: new Date(this.clock()).toISOString(),
              ...(actor.review ? { kind: actor.review, reviewerName: actor.displayName } : {}),
            },
          ],
        };
      } else if (c.action === "exclude") {
        const u = payrollPopulation(state).find((x) => x.id === c.unitId),
          p = events(state).find((x) => x.id === c.evidenceId);
        if (
          !u ||
          !p ||
          p.establishment !== u.establishment ||
          p.month !== u.month ||
          p.rubric !== u.rubric ||
          p.organism !== u.organism ||
          p.pseudonym !== u.pseudonym
        )
          throw Error("HR_EVIDENCE_REQUIRED");
        next = {
          ...state,
          exclusions: [
            ...state.exclusions.filter((x) => x.unitId !== c.unitId),
            { unitId: c.unitId, reason: c.reason, evidenceId: c.evidenceId },
          ],
        };
      } else {
        if (!state.exclusions.some((x) => x.unitId === c.unitId))
          throw Error("HR_EXCLUSION_NOT_FOUND");
        next = {
          ...state,
          exclusions: state.exclusions.filter((x) => x.unitId !== c.unitId),
        };
      }
      this.history.push(state);
      if (!this.durable && this.history.length > 40) this.history.shift();
      this.state = frozen({ ...next, version: state.version + 1 });
      this.audit.push({
        action: c.action,
        version: this.state.version,
        at: new Date(this.clock()).toISOString(),
      });
      if (!this.durable && this.audit.length > 80) this.audit.shift();
      return this.read(actor);
    });
  }
  diagnostic(actor: HRPrincipal | null) {
    this.check(actor, "export");
    return frozen({
      format: "payroll-redacted-diagnostic-1",
      mode: "synthetic",
      version: this.state.version,
      realExtension: "blocked",
      modules: ["framing", "settlements", "leave"],
      nativeDsnParser: false,
      content:
        "Aucun montant, pseudonyme, pièce client ou détail RH dans ce diagnostic.",
      audit: this.audit,
    });
  }
}
export type PayrollView = ReturnType<PayrollRuntime["read"]>;
