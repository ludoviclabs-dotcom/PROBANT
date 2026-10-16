import Link from "next/link";
import { Logo } from "@/components/charte/Logo";
import s from "./landing.module.css";

/** En-tête de la landing : repère PROBANT, quatre ancres de lecture (dès 1080 px) et l'entrée dans la démo. */
export function LandingHeader() {
  return (
    <header className={s.header}>
      <Link href="/" aria-label="PROBANT" className={s.brand}>
        <Logo size="md" />
      </Link>
      <nav aria-label="Sections" className={s.nav}>
        <a href="#couches" className={s.navLink}>Méthode</a>
        <a href="#cloisons" className={s.navLink}>Revue par cloison</a>
        <a href="#preuve" className={s.navLink}>Dossier de preuve</a>
        <a href="#normatif" className={s.navLink}>Audit Normatif 360</a>
      </nav>
      <Link href="/dashboard/synthese" className={s.demoLink}>Ouvrir la démo →</Link>
    </header>
  );
}
