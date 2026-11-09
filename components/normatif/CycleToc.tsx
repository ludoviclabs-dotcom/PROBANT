"use client";

import { useEffect, useState } from "react";
import p from "@/components/charte/page.module.css";
import n from "./normatif.module.css";

/**
 * Sommaire de la fiche cycle (dès 1180 px de contenu) : marque d'un filet bleu la section dont le titre a passé le
 * haut de la fenêtre. Sans JavaScript, ce sont de simples ancres.
 */
export function CycleToc({ items }: { items: { id: string; label: string }[] }) {
  const [current, setCurrent] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let at: string | null = items[0]?.id ?? null;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top < 140) at = item.id;
      }
      setCurrent(at);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items]);

  return (
    <nav className={n.toc} aria-label="Sommaire de la fiche">
      <p className={p.key}>Sommaire</p>
      <ol className={n.tocList}>
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} aria-current={current === item.id ? "true" : undefined}>
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
