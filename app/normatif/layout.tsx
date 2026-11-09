import Link from "next/link";
import { charteFonts } from "@/app/fonts";
import { Logo } from "@/components/charte/Logo";
import { NormatifNav } from "@/components/normatif/NormatifNav";
import { VeilleAge } from "@/components/normatif/VeilleAge";
import { VeilleGlyph, formatDate } from "@/components/normatif/VeilleMarks";
import { loadVeilleReport } from "@/lib/audit-cycles/loader";
import n from "@/components/normatif/normatif.module.css";

export const metadata = {
  title: { default: "Audit Normatif 360 — PROBANT", template: "%s — Audit Normatif 360" },
  description: "Base de connaissance normative des cycles d'audit financier, et veille datée sur ce qui est périmé.",
};

/**
 * Châssis d'Audit Normatif 360 — ambiance « papier » de la charte, dans le prolongement de la section 04 de la
 * landing : repère PROBANT, onglets du module, bandeau d'état (avertissement d'expertise et veille) toujours
 * visible, puis le contenu, qui défile avec le document.
 */
export default async function NormatifLayout({ children }: { children: React.ReactNode }) {
  const veille = await loadVeilleReport();
  const enVigueur = veille ? veille.counts.enVigueurAIntegrer + veille.counts.sansDateAIntegrer : 0;

  return (
    <div data-ambiance="papier" data-document-surface className={`${charteFonts} ${n.root}`}>
      <a href="#contenu" className={n.skip}>
        Aller au contenu
      </a>
      <header className={n.header}>
        <Link href="/" aria-label="PROBANT — accueil" className={n.brand}>
          <Logo size="md" />
        </Link>
        <span className={n.module}>
          Audit Normatif 360 <span className={n.moduleNote}>base de connaissance</span>
        </span>
        <Link href="/dashboard/synthese" className={n.fecLink}>
          Analyse FEC →
        </Link>
      </header>
      <NormatifNav veilleOpen={enVigueur} />
      <div className={`${n.ribbon} ${n.plane2}`} role="note" aria-label="État du référentiel">
        <span className={n.ribbonItem}>
          <VeilleGlyph glyph="sq-line" />
          <span>
            Contenu à valider par un expert
            <span className={n.ribbonLong}> : citations, paragraphes et seuils en statut « revue requise »</span>.
          </span>
        </span>
        {veille ? (
          <span className={n.ribbonItem}>
            <VeilleGlyph glyph={enVigueur > 0 ? "sq-fill" : "dot"} />
            <span>
              Veille arrêtée au {formatDate(veille.arreteAu)} (<VeilleAge arreteAu={veille.arreteAu} />) :{" "}
              {enVigueur > 0 ? (
                <Link href="/normatif/veille" className={n.ribbonLink}>
                  {enVigueur} évolution{enVigueur > 1 ? "s" : ""} en vigueur à reprendre
                </Link>
              ) : (
                <Link href="/normatif/veille" className={n.ribbonLink}>
                  aucune évolution en vigueur à reprendre
                </Link>
              )}
            </span>
          </span>
        ) : (
          <span className={n.ribbonItem}>
            <VeilleGlyph glyph="ring" />
            Aucune veille arrêtée : la fraîcheur des sources n&apos;est pas établie.
          </span>
        )}
      </div>
      <main id="contenu" className={n.main}>
        {children}
      </main>
      <footer className={n.footer}>
        <span>Audit Normatif 360 — base de connaissance normative, complémentaire à l&apos;analyse FEC de PROBANT.</span>
        <span className={n.footerMono}>ISA · NEP · IFRS · PCG · Code de commerce · CGI · UE · AFA</span>
      </footer>
    </div>
  );
}
