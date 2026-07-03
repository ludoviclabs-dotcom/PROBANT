import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type StepStatus = "idle" | "processing" | "done" | "error";
type NodeState = "done" | "current" | "pending";

interface IngestionStepperProps {
  labels: string[];
  activeIndex: number;
  status: StepStatus;
}

export function IngestionStepper({ labels, activeIndex, status }: IngestionStepperProps) {
  if (status === "idle") {
    return null;
  }

  const getNodeState = (index: number): NodeState => {
    if (index <= activeIndex || status === "done") return "done";
    if (index === activeIndex && status === "processing") return "current";
    return "pending";
  };

  return (
    <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
      <div className="flex items-center">
        {labels.map((label, index) => {
          const state = getNodeState(index);
          const isLast = index === labels.length - 1;

          return (
            <div key={label} className={cn("flex items-center", !isLast && "flex-1")}>
              <div className="flex w-14 shrink-0 flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
                    state === "pending" && "border-[var(--pb-border-strong)]",
                    state === "current" && "border-[var(--pb-accent)]",
                    state === "done" && "border-transparent",
                  )}
                  style={
                    state === "done"
                      ? { backgroundColor: "color-mix(in srgb, var(--pb-ok) 15%, transparent)" }
                      : undefined
                  }
                >
                  {state === "pending" && (
                    <span className="text-[10px] text-[var(--pb-text-faint)] tnum">{index + 1}</span>
                  )}
                  {state === "current" && (
                    <Loader2 className="h-3 w-3 animate-spin text-[var(--pb-accent)]" />
                  )}
                  {state === "done" && (
                    <CheckCircle2 className="h-3 w-3 text-[var(--pb-ok)]" />
                  )}
                </div>
                <span
                  className={cn(
                    "w-full text-center text-[10px] leading-tight",
                    state === "pending" ? "text-[var(--pb-text-muted)]" : "text-[var(--pb-text)]",
                  )}
                >
                  {label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "h-0.5 flex-1 transition-colors duration-300",
                    state === "done" ? "bg-[var(--pb-accent)]" : "bg-[var(--pb-border)]",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
