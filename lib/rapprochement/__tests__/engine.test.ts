import { describe, it, expect } from "vitest";
import { rapprocher, joursEntre } from "../engine";
import { resultToFindings } from "../to-findings";
import {
  BALANCE_AGEE_CLIENTS,
  GRAND_LIVRE_411,
  CONFIG_CLIENTS,
  CLOTURE_DEMO,
  runClientsRapprochement,
  buildClientsRapprochementSilo,
} from "../demo/clients";

describe("joursEntre", () => {
  it("calcule l'écart en jours entre deux dates AAAAMMJJ", () => {
    expect(joursEntre("20241231", "20241221")).toBe(10);
    expect(joursEntre("20240101", "20231231")).toBe(1);
    expect(joursEntre("bad", "20240101")).toBeNull();
    expect(joursEntre(undefined, "20240101")).toBeNull();
  });
});

describe("rapprocher — cycle Clients (démo)", () => {
  const result = runClientsRapprochement();
  const byTiers = (t: string) => result.ecarts.find((e) => e.tiers === t || e.libelle === t);

  it("calcule les totaux et l'écart global", () => {
    expect(result.totalSource).toBe(103850);
    expect(result.totalCible).toBe(94350);
    expect(result.ecartGlobal).toBe(9500);
  });

  it("ne signale ni les postes rapprochés récents ni les anciens déjà dépréciés", () => {
    expect(byTiers("MARTIN SARL")).toBeUndefined(); // rapproché, récent
    expect(byTiers("PETIT SA")).toBeUndefined(); // ancien mais lettré (déprécié)
  });

  it("qualifie une créance ancienne non dépréciée en dépréciation insuffisante", () => {
    const dupont = byTiers("DUPONT SA");
    expect(dupont).toBeDefined();
    expect(dupont!.qualification).toBe("provision_insuffisante");
    expect(dupont!.severite).toBe("majeur");
    expect(dupont!.montantSource).toBe(24850);
    expect(dupont!.montantCible).toBe(0);
    expect(dupont!.sourceKey).toBe("PCG_CREANCES");
  });

  it("détecte un écart de solde entre les deux documents", () => {
    const leroy = byTiers("LEROY SAS");
    expect(leroy).toBeDefined();
    expect(leroy!.qualification).toBe("rapprochement_solde");
    expect(leroy!.ecart).toBe(6000);
  });

  it("détecte les écarts de périmètre dans les deux sens", () => {
    const bernard = byTiers("BERNARD & Cie"); // dans A, absent de B
    const durand = byTiers("DURAND SA"); // dans B, absent de A
    expect(bernard?.qualification).toBe("perimetre");
    expect(bernard?.montantCible).toBe(0);
    expect(durand?.qualification).toBe("perimetre");
    expect(durand?.montantSource).toBe(0);
  });

  it("n'émet pas d'écart de solde global résiduel quand le détail explique tout", () => {
    expect(result.ecarts.find((e) => e.niveau === "total")).toBeUndefined();
  });

  it("calcule un taux de rapprochement cohérent", () => {
    expect(result.tauxRapprochement).toBeCloseTo(1 - 9500 / 103850, 4);
  });

  it("produit 4 écarts au total", () => {
    expect(result.ecarts).toHaveLength(4);
  });
});

describe("resultToFindings — conversion canonique", () => {
  const findings = resultToFindings(runClientsRapprochement());

  it("produit un Finding par écart, marqué origine rapprochement", () => {
    expect(findings).toHaveLength(4);
    for (const f of findings) {
      expect(f.origine).toBe("rapprochement");
      expect(f.qualification).toBeDefined();
      expect(f.cycleSlug).toBe("creances-clients");
      expect(f.id.startsWith("RAPPRO-creances-clients-")).toBe(true);
      expect(f.statutRevue).toBe("en_attente");
      expect(f.source.ref.length).toBeGreaterThan(0);
      expect(f.preuve.length).toBe(4);
    }
  });

  it("dérive la famille de la source (PCG = hardLaw, ISA = methodology)", () => {
    const dupont = findings.find((f) => f.titre.includes("DUPONT"));
    const leroy = findings.find((f) => f.titre.includes("LEROY"));
    expect(dupont!.family).toBe("hardLaw"); // PCG_CREANCES
    expect(leroy!.family).toBe("methodology"); // ISA_500
  });

  it("ne contient aucune référence vide (pas de citation inventée)", () => {
    for (const f of findings) {
      expect(f.source.citation.length).toBeGreaterThan(10);
    }
  });
});

describe("buildClientsRapprochementSilo", () => {
  it("assemble un silo avec état de rapprochement et constats", () => {
    const silo = buildClientsRapprochementSilo();
    expect(silo.siloId).toBe("rapprochement-clients");
    expect(silo.statement.rows).toHaveLength(3);
    expect(silo.findings.length).toBe(4);
    const ecartRow = silo.statement.rows.find((r) => r.id === "rappro-ecart");
    expect(ecartRow?.valeur).toBe(9500);
    expect(ecartRow?.flaggedBy).toBe(silo.findings[0].id);
  });
});

describe("généricité — config seuil d'antériorité", () => {
  it("respecte un seuil d'antériorité personnalisé", () => {
    const res = rapprocher(BALANCE_AGEE_CLIENTS, GRAND_LIVRE_411, { ...CONFIG_CLIENTS, seuilAncienneteJours: 600 }, { dateReference: CLOTURE_DEMO });
    // Avec un seuil à 600 j, DUPONT (412 j) n'est plus « ancien » → pas de provision.
    const dupont = res.ecarts.find((e) => e.tiers === "DUPONT SA");
    expect(dupont?.qualification).not.toBe("provision_insuffisante");
  });
});
