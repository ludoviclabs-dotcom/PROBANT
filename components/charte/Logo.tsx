/**
 * Logo « Repère » (piste 1 de la charte) : la ligne de preuve devient le symbole — repère de départ,
 * cercle du constat, carré de la source — suivi du mot PROBANT en capitales Newsreader espacées de 16 %.
 * Le carré seul sert de favicon. Les couleurs suivent l'ambiance (`--pb-ink`, `--pb-bg`).
 */

const GEOMETRY = {
  /** En-tête de la landing. */
  md: { w: 34, h: 16, y: 8, tick: [2, 14], circle: { cx: 17, r: 5, sw: 1.3 }, square: { x: 27, y: 4.5, s: 7 }, word: 19, gap: 12 },
  /** Rail du tableau de bord. */
  sm: { w: 30, h: 14, y: 7, tick: [2, 12], circle: { cx: 15, r: 4.2, sw: 1.2 }, square: { x: 24, y: 4, s: 6 }, word: 17, gap: 10 },
} as const;

export function Logo({ size = "md", wordmark = true }: { size?: keyof typeof GEOMETRY; wordmark?: boolean }) {
  const g = GEOMETRY[size];
  const ink = { stroke: "var(--pb-ink)" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: g.gap }}>
      <svg width={g.w} height={g.h} viewBox={`0 0 ${g.w} ${g.h}`} aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
        <line x1={0} y1={g.y} x2={g.w} y2={g.y} strokeWidth={1} style={ink} />
        <line x1={0.5} y1={g.tick[0]} x2={0.5} y2={g.tick[1]} strokeWidth={1} style={ink} />
        <circle cx={g.circle.cx} cy={g.y} r={g.circle.r} strokeWidth={g.circle.sw} style={{ ...ink, fill: "var(--pb-bg)" }} />
        <rect x={g.square.x} y={g.square.y} width={g.square.s} height={g.square.s} style={{ fill: "var(--pb-ink)" }} />
      </svg>
      {wordmark && (
        <span style={{ fontFamily: "var(--pb-font-serif)", fontSize: g.word, letterSpacing: ".16em", fontWeight: 500, lineHeight: 1 }}>PROBANT</span>
      )}
    </span>
  );
}
