import { ArrowRight, FileText, Layers } from "lucide-react";

const PARTICLES = [
  { top: "15%", left: "20%", duration: 3.4, delay: 0 },
  { top: "70%", left: "15%", duration: 4.1, delay: 0.6 },
  { top: "30%", left: "75%", duration: 3.8, delay: 1.2 },
  { top: "85%", left: "60%", duration: 4.6, delay: 0.3 },
  { top: "10%", left: "55%", duration: 3.2, delay: 1.6 },
  { top: "55%", left: "85%", duration: 4.3, delay: 2 },
];

export function DropzoneArt({ active }: { active: boolean }) {
  return (
    <div className="relative flex h-20 w-full items-center justify-center">
      {PARTICLES.map((particle, index) => (
        <span
          key={index}
          className="pointer-events-none absolute z-0 h-1 w-1 rounded-full bg-[var(--pb-accent)]/20"
          style={{
            top: particle.top,
            left: particle.left,
            animation: `pb-float ${active ? particle.duration * 0.6 : particle.duration}s ease-in-out ${particle.delay}s infinite`,
            opacity: active ? 0.4 : undefined,
          }}
        />
      ))}
      <div className="relative z-10 flex items-center justify-center gap-3">
        <FileText className="h-7 w-7 text-[var(--pb-accent)]" />
        <span className="text-[var(--pb-text-faint)]">···</span>
        <ArrowRight className="h-5 w-5 animate-pulse text-[var(--pb-text-faint)]" />
        <span className="text-[var(--pb-text-faint)]">···</span>
        <Layers className="h-7 w-7 text-[var(--pb-accent)]" />
      </div>
    </div>
  );
}
