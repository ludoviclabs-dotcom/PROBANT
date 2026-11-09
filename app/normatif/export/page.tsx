import { loadAllCycles } from "@/lib/audit-cycles/loader";
import p from "@/components/charte/page.module.css";
import n from "@/components/normatif/normatif.module.css";

const FORMATS = [
  { format: "JSON", title: "Cartographie complète", desc: "Toutes les fiches avec l'intégralité des champs structurés.", href: "/api/normatif/export?format=json" },
  { format: "CSV", title: "Synthèse tabulaire", desc: "Une ligne par cycle : famille, comptes, compteurs, statut.", href: "/api/normatif/export?format=csv" },
  { format: "Markdown", title: "Cartographie lisible", desc: "Toutes les fiches, l'une après l'autre, en texte structuré.", href: "/api/normatif/export?format=md" },
] as const;

export const metadata = { title: "Export" };

export default async function ExportPage() {
  const cycles = await loadAllCycles();

  return (
    <>
      <header className={p.intro}>
        <div className={p.introMain}>
          <p className={p.eyebrow}>Audit Normatif 360 · export</p>
          <h1 className={p.title}>Export de la cartographie</h1>
          <p className={p.lead}>
            Les {cycles.length} cycles d&apos;audit dans le format de votre choix, pour archivage, revue ou intégration.
          </p>
        </div>
      </header>

      <ul className={n.rows} aria-label="Formats d'export">
        {FORMATS.map((f) => (
          <li key={f.format} className={n.exportRow}>
            <span className={n.exportFormat}>{f.format}</span>
            <div>
              <p className={n.lineTitle}>{f.title}</p>
              <p className={n.lineText}>{f.desc}</p>
            </div>
            <a href={f.href} className={p.btnSecondary}>
              Télécharger
            </a>
          </li>
        ))}
      </ul>

      <p className={p.note}>
        Les exports reflètent l&apos;état actuel des fichiers YAML de <code>data/</code>. Le contenu est en statut « revue
        requise » : à valider par un expert audit avant toute utilisation opposable.
      </p>
    </>
  );
}
