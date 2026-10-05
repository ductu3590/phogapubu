import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

// Khối nội dung trắng bo góc (Stitch m02/m05). Icon nằm trong ô tròn nền màu chủ đạo nhạt.
export default function SectionCard({ title, subtitle, icon, action, children, className }: {
  title?: string; subtitle?: string; icon?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string;
}) {
  return (
    <section className={cn("mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-start gap-3">
          {icon && <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary [&>svg]:size-5">{icon}</span>}
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-normal-sb font-bold text-text-primary">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xxsmall text-text-secondary">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
