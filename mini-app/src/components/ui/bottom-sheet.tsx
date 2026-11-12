import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useAppStore } from "@/stores/app.store";

const loadClassicSheet = () => import("./classic-sheet");
const ClassicSheet = lazy(loadClassicSheet);

/** Tải sẵn bảng trượt ZaUI lúc máy rảnh để lần bấm đầu tiên không phải chờ. */
export function preloadClassicSheet() {
  const run = () => void loadClassicSheet();
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 3000 });
  else window.setTimeout(run, 1500);
}

// Bảng trượt từ đáy màn hình, theo theme của quán:
//   classic → Sheet của ZaUI (giữ nguyên hình và cử chỉ kéo như trước), nạp trễ;
//   garden  → bảng nhẹ bằng CSS, không thư viện.
export default function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const theme = useAppStore((s) => s.theme);
  // classic: chỉ dựng Sheet từ lần mở đầu tiên, sau đó giữ để có hiệu ứng đóng.
  const [opened, setOpened] = useState(visible);
  useEffect(() => {
    if (visible) setOpened(true);
  }, [visible]);

  if (theme === "garden") {
    if (!visible) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose} role="presentation">
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className="mevo-sheet-up w-full overflow-hidden rounded-t-[28px] bg-surface"
          style={{ paddingBottom: "var(--zaui-safe-area-inset-bottom, 0px)" }}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-neutral100" aria-hidden />
          {children}
        </div>
      </div>
    );
  }

  if (!opened) return null;
  return (
    <Suspense fallback={null}>
      <ClassicSheet visible={visible} onClose={onClose}>
        {children}
      </ClassicSheet>
    </Suspense>
  );
}
