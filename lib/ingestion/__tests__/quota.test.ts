import { describe, expect, it } from "vitest";
import {
  InMemoryUploadQuotaStore,
  UploadQuotaService,
  readUploadQuotaPolicy,
  windowStart,
} from "../quota";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const POLICY = { ratePerMinute: 3, filesPerDay: 5, bytesPerDay: 1_000 };

function service(nowMs: () => number) {
  return new UploadQuotaService(new InMemoryUploadQuotaStore(), POLICY, nowMs);
}

describe("politique de quota", () => {
  it("échoue fermé si une limite n'est pas configurée", () => {
    expect(() =>
      readUploadQuotaPolicy({ UPLOAD_RATE_LIMIT_PER_MINUTE: "10" }),
    ).toThrowError(/UPLOAD_QUOTA_NOT_CONFIGURED/u);
  });

  it("lit les trois limites", () => {
    expect(
      readUploadQuotaPolicy({
        UPLOAD_RATE_LIMIT_PER_MINUTE: "10",
        UPLOAD_QUOTA_FILES_PER_DAY: "100",
        UPLOAD_QUOTA_BYTES_PER_DAY: "1073741824",
      }),
    ).toEqual({ ratePerMinute: 10, filesPerDay: 100, bytesPerDay: 1_073_741_824 });
  });
});

describe("fenêtres", () => {
  it("aligne la fenêtre minute et la fenêtre jour", () => {
    const now = Date.UTC(2026, 7, 14, 10, 30, 45, 123);
    expect(windowStart("minute", now).toISOString()).toBe("2026-08-14T10:30:00.000Z");
    expect(windowStart("day", now).toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });
});

describe("rate limit", () => {
  it("laisse passer jusqu'à la limite puis refuse", async () => {
    const quota = service(() => 0);
    for (let attempt = 0; attempt < POLICY.ratePerMinute; attempt += 1) {
      await expect(quota.reserve(ORG_A, 10)).resolves.toBeDefined();
    }
    await expect(quota.reserve(ORG_A, 10)).rejects.toThrowError(
      expect.objectContaining({ code: "UPLOAD_RATE_LIMITED", status: 429, retryable: true }),
    );
  });

  it("repart à zéro à la minute suivante", async () => {
    let nowMs = 0;
    const quota = service(() => nowMs);
    for (let attempt = 0; attempt < POLICY.ratePerMinute; attempt += 1) {
      await quota.reserve(ORG_A, 10);
    }
    nowMs = 60_000;
    await expect(quota.reserve(ORG_A, 10)).resolves.toBeDefined();
  });

  it("compte séparément chaque organisation", async () => {
    const quota = service(() => 0);
    for (let attempt = 0; attempt < POLICY.ratePerMinute; attempt += 1) {
      await quota.reserve(ORG_A, 10);
    }
    await expect(quota.reserve(ORG_B, 10)).resolves.toBeDefined();
  });

  it("ne consomme pas le quota journalier quand le rate limit refuse", async () => {
    let nowMs = 0;
    const quota = service(() => nowMs);
    for (let attempt = 0; attempt < POLICY.ratePerMinute; attempt += 1) {
      await quota.reserve(ORG_A, 100);
    }
    await expect(quota.reserve(ORG_A, 100)).rejects.toThrow();
    // 3 dépôts acceptés = 300 octets ; la minute suivante doit pouvoir en
    // accepter 2 de plus (5 fichiers/jour) sans dépasser 1 000 octets.
    nowMs = 60_000;
    await expect(quota.reserve(ORG_A, 100)).resolves.toBeDefined();
    await expect(quota.reserve(ORG_A, 100)).resolves.toBeDefined();
  });
});

describe("quota journalier", () => {
  it("refuse au-delà du nombre de fichiers", async () => {
    let nowMs = 0;
    const quota = service(() => nowMs);
    for (let attempt = 0; attempt < POLICY.filesPerDay; attempt += 1) {
      nowMs += 60_000;
      await quota.reserve(ORG_A, 1);
    }
    nowMs += 60_000;
    await expect(quota.reserve(ORG_A, 1)).rejects.toThrowError(
      expect.objectContaining({ code: "UPLOAD_QUOTA_EXCEEDED", retryable: false }),
    );
  });

  it("refuse au-delà du volume, même sous le nombre de fichiers", async () => {
    let nowMs = 0;
    const quota = service(() => nowMs);
    await quota.reserve(ORG_A, 900);
    nowMs += 60_000;
    await expect(quota.reserve(ORG_A, 200)).rejects.toThrowError(
      expect.objectContaining({ code: "UPLOAD_QUOTA_EXCEEDED" }),
    );
  });

  it("ne compte pas un dépôt refusé pour dépassement", async () => {
    let nowMs = 0;
    const quota = service(() => nowMs);
    await quota.reserve(ORG_A, 900);
    nowMs += 60_000;
    await expect(quota.reserve(ORG_A, 200)).rejects.toThrow();
    // Le refus n'a rien consommé : un fichier plus petit doit encore passer.
    nowMs += 60_000;
    await expect(quota.reserve(ORG_A, 100)).resolves.toBeDefined();
  });

  it("repart à zéro le lendemain", async () => {
    let nowMs = 0;
    const quota = service(() => nowMs);
    await quota.reserve(ORG_A, 900);
    nowMs = 86_400_000;
    await expect(quota.reserve(ORG_A, 900)).resolves.toBeDefined();
  });
});

describe("restitution d'une réservation", () => {
  it("rend exactement ce qui a été consommé", async () => {
    const store = new InMemoryUploadQuotaStore();
    const quota = new UploadQuotaService(store, POLICY, () => 0);

    const reservation = await quota.reserve(ORG_A, 400);
    await quota.release(reservation);

    // Après restitution, la fenêtre est comme si rien n'avait été déposé :
    // les trois dépôts suivants doivent tous passer.
    for (let attempt = 0; attempt < POLICY.ratePerMinute; attempt += 1) {
      await expect(quota.reserve(ORG_A, 100)).resolves.toBeDefined();
    }
  });

  it("restitue dans la fenêtre d'origine, pas dans la fenêtre courante", async () => {
    let nowMs = 0;
    const store = new InMemoryUploadQuotaStore();
    const quota = new UploadQuotaService(store, POLICY, () => nowMs);

    const reservation = await quota.reserve(ORG_A, 100);
    // La minute change entre la réservation et sa restitution.
    nowMs = 120_000;
    const autre = await quota.reserve(ORG_A, 100);
    await quota.release(reservation);

    // La consommation de `autre` ne doit pas avoir été effacée : elle occupe
    // toujours sa place dans la fenêtre courante.
    expect(autre.minuteStart.getTime()).toBe(120_000);
    expect(reservation.minuteStart.getTime()).toBe(0);
  });

  it("un rejeu idempotent restitué ne grignote pas le quota journalier", async () => {
    let nowMs = 0;
    const store = new InMemoryUploadQuotaStore();
    const quota = new UploadQuotaService(store, POLICY, () => nowMs);

    // 5 tentatives du même fichier de 200 octets : 1 retenue, 4 rendues.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      nowMs += 60_000;
      const reservation = await quota.reserve(ORG_A, 200);
      if (attempt > 0) await quota.release(reservation);
    }

    // 200 octets consommés sur 1 000 : il reste de la place.
    nowMs += 60_000;
    await expect(quota.reserve(ORG_A, 700)).resolves.toBeDefined();
  });
});
