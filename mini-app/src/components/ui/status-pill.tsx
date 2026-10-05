import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export type PillTone = "success" | "info" | "warning" | "critical" | "neutral";
const TONE: Record<PillTone, string> = {
  success: "bg-success-bg text-success border-success-border",
  info: "bg-info-bg text-info border-info-border",
  warning: "bg-warning-bg text-warning border-warning-border",
  critical: "bg-critical-bg text-critical border-critical-border",
  neutral: "bg-neutral100 text-text-secondary border-neutral200",
};
const DOT: Record<PillTone, string> = {
  success: "bg-success-dot", info: "bg-info-dot", warning: "bg-warning-dot", critical: "bg-critical-dot", neutral: "bg-neutral300",
};

// Nhãn trạng thái — màu theo Ý NGHĨA, không theo màu quán; luôn có chữ.
export default function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xxsmall font-semibold", TONE[tone])}>
      <span className={cn("size-1.5 rounded-full", DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}
