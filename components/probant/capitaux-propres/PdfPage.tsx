"use client";
import { useEffect, useRef, useState } from "react";
import styles from "../cash/cash.module.css";
import eq from "./equity.module.css";

/**
 * Renders one page of a versioned PV on request, from the original bytes served under the download permission.
 * No text is turned into a value: the page text layer is shown for reading and accessibility only.
 */
export function PdfPage({ url, page, title, canDownload }: { url: string; page: number; title: string; canDownload: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle"), [text, setText] = useState(""), [error, setError] = useState(""), [zoom, setZoom] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null), request = useRef(0);
  useEffect(() => { request.current++; setState("idle"); setText(""); setError(""); }, [url, page]);
  async function render() {
    const id = ++request.current;
    setState("loading"); setError("");
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 403 ? "Permission de téléchargement requise pour afficher le PV." : "Original du PV indisponible.");
      const data = new Uint8Array(await response.arrayBuffer());
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
      if (page > doc.numPages) throw new Error("Page " + page + " absente du PDF (" + doc.numPages + " page(s)).");
      const p = await doc.getPage(page), viewport = p.getViewport({ scale: 1.6 }), target = canvas.current, context = target?.getContext("2d");
      if (!target || !context) throw new Error("Rendu graphique indisponible dans ce navigateur ; utilisez le téléchargement de l’original.");
      target.width = Math.floor(viewport.width); target.height = Math.floor(viewport.height);
      await p.render({ canvasContext: context, viewport }).promise;
      const content = await p.getTextContent();
      if (id !== request.current) return;
      setText(content.items.map(i => "str" in i ? i.str : "").join(" ").replace(/\s+/g, " ").trim()); setState("ready");
    } catch (e) { if (id === request.current) { setError(e instanceof Error ? e.message : "Rendu impossible."); setState("failed"); } }
  }
  if (!canDownload) return <p className={styles.muted}>Affichage de la page réservé à la permission de téléchargement des originaux.</p>;
  return <div>
    {state !== "ready" && <button type="button" onClick={() => void render()} disabled={state === "loading"}>{state === "loading" ? "Rendu de la page en cours…" : "Afficher la page " + page + " du PV"}</button>}
    {state === "loading" && <p role="status" className={styles.muted}>Lecture de l’original versionné…</p>}
    {state === "failed" && <p role="alert" className={styles.notice} data-tone="danger">{error}</p>}
    {state === "ready" && <button type="button" aria-pressed={zoom} onClick={() => setZoom(z => !z)}>Agrandir la page</button>}
    <div className={eq.pvFrame} data-zoom={zoom} hidden={state !== "ready"} tabIndex={state === "ready" ? 0 : -1} role="region" aria-label={"Page " + page + " du PV — défilement"}><canvas ref={canvas} className={eq.pvPage} role="img" aria-label={title + " — page " + page}/></div>
    {state === "ready" && <details><summary>Texte de la page (couche texte du PDF, non interprétée)</summary><p>{text || "Aucune couche texte : lecture visuelle uniquement."}</p></details>}
  </div>;
}
