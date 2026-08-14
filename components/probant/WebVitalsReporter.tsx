"use client";

import { useEffect } from "react";
import { classifyPage, type VitalSample } from "@/lib/performance/web-vitals";

/**
 * Collecte RUM des Core Web Vitals.
 *
 * Aucune bibliothèque tierce, aucun connecteur externe : la mesure utilise les
 * API natives `PerformanceObserver` et part vers `/api/rum`, sur la même
 * origine. Aucune donnée de dossier n'est transmise — la route est réduite à
 * l'une des sept pages mesurées avant l'envoi.
 *
 * Trois métriques :
 * - **LCP** : dernière entrée `largest-contentful-paint` avant interaction ;
 * - **INP** : pire durée d'interaction observée (approximation par
 *   `event`/`first-input`, cf. `docs/release/PERFORMANCE_REPORT.md`) ;
 * - **CLS** : plus grande fenêtre glissante de décalages, méthode standard.
 */
export function WebVitalsReporter() {
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;

    const page = classifyPage(window.location.pathname);
    const navigationType = readNavigationType();
    const collected = new Map<VitalSample["name"], number>();
    const observers: PerformanceObserver[] = [];

    const observe = (
      type: string,
      callback: (entries: PerformanceEntryList) => void,
      options: PerformanceObserverInit = {},
    ) => {
      try {
        const observer = new PerformanceObserver((list) => callback(list.getEntries()));
        observer.observe({ type, buffered: true, ...options });
        observers.push(observer);
      } catch {
        // Métrique non supportée par ce navigateur : on n'en mesure aucune
        // approximation, une valeur inventée serait pire qu'une valeur absente.
      }
    };

    observe("largest-contentful-paint", (entries) => {
      const last = entries[entries.length - 1];
      if (last) collected.set("LCP", last.startTime);
    });

    observe("first-input", (entries) => {
      for (const entry of entries) {
        const timing = entry as PerformanceEventTiming;
        const delay = timing.processingStart - timing.startTime;
        collected.set("INP", Math.max(collected.get("INP") ?? 0, delay));
      }
    });

    observe(
      "event",
      (entries) => {
        for (const entry of entries) {
          collected.set("INP", Math.max(collected.get("INP") ?? 0, entry.duration));
        }
      },
      { durationThreshold: 40 } as PerformanceObserverInit,
    );

    let clsValue = 0;
    let sessionValue = 0;
    let sessionStart = 0;
    let sessionLast = 0;
    observe("layout-shift", (entries) => {
      for (const entry of entries) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (shift.hadRecentInput) continue;
        // Fenêtre glissante : ≤ 1 s entre deux décalages, ≤ 5 s au total.
        if (
          sessionValue > 0 &&
          shift.startTime - sessionLast < 1_000 &&
          shift.startTime - sessionStart < 5_000
        ) {
          sessionValue += shift.value;
        } else {
          sessionValue = shift.value;
          sessionStart = shift.startTime;
        }
        sessionLast = shift.startTime;
        clsValue = Math.max(clsValue, sessionValue);
        collected.set("CLS", clsValue);
      }
    });

    /** Un seul envoi, au moment où la page devient invisible. */
    let sent = false;
    const flush = () => {
      if (sent) return;
      sent = true;
      for (const observer of observers) observer.disconnect();

      const samples: VitalSample[] = [...collected.entries()].map(([name, value]) => ({
        name,
        // CLS est un score sans unité ; LCP et INP sont arrondis à la ms.
        value: name === "CLS" ? Math.round(value * 10_000) / 10_000 : Math.round(value),
        page,
        navigationType,
      }));
      if (samples.length === 0) return;

      const body = JSON.stringify({ samples });
      // `sendBeacon` survit au déchargement de la page ; `fetch` en repli.
      if (navigator.sendBeacon?.(
        "/api/rum",
        new Blob([body], { type: "application/json" }),
      )) {
        return;
      }
      void fetch("/api/rum", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        // La télémétrie ne doit jamais perturber la session de travail.
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flush);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flush);
      for (const observer of observers) observer.disconnect();
    };
  }, []);

  return null;
}

function readNavigationType(): VitalSample["navigationType"] {
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  const type = entry?.type;
  return type === "navigate" ||
    type === "reload" ||
    type === "back_forward" ||
    type === "prerender"
    ? type === "back_forward"
      ? "back-forward"
      : type
    : "unknown";
}
