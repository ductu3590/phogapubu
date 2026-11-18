import { useEffect, useRef } from "react";
import { cn } from "@/utils/cn";

// Chip danh mục cuộn ngang (m06). Chip đang chọn tự cuộn vào giữa hàng — CHỈ cuộn hàng ngang này.
// Không dùng scrollIntoView: nó cuộn cả vùng cuộn dọc bên ngoài và cắt ngang lệnh cuộn tới danh
// mục vừa bấm (bấm chip mà danh sách đứng im).
export default function CategoryChips({ items, activeId, onSelect }: { items: { id: string; name: string }[]; activeId: string; onSelect: (id: string) => void }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    const row = rowRef.current;
    const chip = refs.current[activeId];
    if (!row || !chip) return;
    const left = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [activeId]);
  return (
    <div ref={rowRef} className="no-scrollbar flex gap-2 overflow-x-auto px-3 py-2 garden:mt-1 garden:gap-5 garden:border-b garden:border-neutral100 garden:px-4 garden:py-0">
      {items.map((c) => (
        <button key={c.id} ref={(el) => { refs.current[c.id] = el; }} type="button" onClick={() => onSelect(c.id)}
          className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xxsmall font-bold uppercase tracking-wide transition-colors",
            "garden:-mb-px garden:rounded-none garden:bg-transparent garden:px-0 garden:pb-2.5 garden:pt-3 garden:text-[16px] garden:normal-case garden:tracking-normal garden:shadow-none",
            activeId === c.id
              ? "bg-primary text-white shadow-sm garden:border-b-[2.5px] garden:border-primary garden:text-text-primary"
              : "border border-neutral200 bg-surface text-text-secondary garden:border-0 garden:font-medium")}>
          {c.name}
        </button>
      ))}
    </div>
  );
}
