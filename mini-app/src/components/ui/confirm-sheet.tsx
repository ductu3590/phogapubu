import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

// Hộp xác nhận đáy màn hình — thay window.confirm trong luồng khách. Bấm nền / "Không" là đóng,
// không làm gì; chỉ nút chính mới thực hiện.
export default function ConfirmSheet({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Không",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={busy ? undefined : onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-3xl bg-surface p-5"
        style={{ paddingBottom: "calc(var(--zaui-safe-area-inset-bottom, 0px) + 20px)" }}
      >
        <p className="text-large-m font-bold text-text-primary">{title}</p>
        {description && <div className="mt-1.5 text-small text-text-secondary">{description}</div>}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="h-12 flex-1 rounded-2xl border border-neutral200 text-small-m font-semibold text-text-primary disabled:opacity-50">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn("h-12 flex-1 rounded-2xl text-small-m font-bold text-white disabled:opacity-60", danger ? "bg-critical" : "bg-primary")}
          >
            {busy ? "Đang xử lý…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
