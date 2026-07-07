// Bottom sheet hiển thị Điều khoản sử dụng — header dính + nút Đóng, thân cuộn được.
// Dựng theo pattern permission-sheet.tsx.
import { renderMarkdown } from "@/utils/markdown";

interface TermsSheetProps {
  visible: boolean;
  content: string;
  onClose: () => void;
}

export default function TermsSheet({ visible, content, onClose }: TermsSheetProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-[85vh] flex-col rounded-t-2xl bg-white">
        {/* Header dính */}
        <div
          className="flex items-center justify-between border-b border-neutral100 px-4 pb-3"
          style={{ paddingTop: "calc(var(--zaui-safe-area-inset-top, 0px) + 12px)" }}
        >
          <span className="w-12" />
          <p className="text-medium-m font-bold text-text-primary">Điều khoản sử dụng</p>
          <button
            onClick={onClose}
            className="w-12 text-right text-small font-semibold text-primary active:opacity-60"
          >
            Đóng
          </button>
        </div>
        {/* Thân cuộn */}
        <div
          className="flex-1 overflow-y-auto px-4 pt-3"
          style={{ paddingBottom: "calc(var(--zaui-safe-area-inset-bottom, 0px) + 24px)" }}
        >
          {renderMarkdown(content)}
        </div>
      </div>
    </div>
  );
}
