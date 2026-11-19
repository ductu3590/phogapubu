import { useNavigate } from "react-router-dom";
import { ArrowRightIcon, ShoppingCartIcon } from "@/components/common/icons";
import { formatCurrency } from "@/utils/format";
import StickyActionBar from "./sticky-action-bar";

// Thanh giỏ tối kiểu Stitch m06: "N món đã chọn · Bàn 09 · tổng" + Xem đơn.
export default function StickyCartBar({ count, total, tableLabel, aboveTabBar }: { count: number; total: number; tableLabel?: string; aboveTabBar: boolean }) {
  const navigate = useNavigate();
  if (count === 0) return null;
  return (
    <StickyActionBar variant="dark" aboveTabBar={aboveTabBar}>
      <button type="button" onClick={() => navigate("/checkout")} className="flex w-full items-center gap-3 rounded-2xl bg-neutral900 px-3 py-2.5 text-left text-white shadow-lg active:opacity-90 garden:h-14 garden:rounded-[18px] garden:bg-primary garden:py-0 garden:pl-[18px] garden:pr-2 garden:shadow-none">
        <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 garden:hidden">
          <ShoppingCartIcon className="size-5" />
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-critical px-1 text-xxxsmall font-bold">{count > 99 ? "99+" : count}</span>
        </span>
        {/* Garden: bàn + tạm tính đã ở chip trên đầu trang nên ở đây chỉ còn số món + tiền giỏ. */}
        <span className="hidden min-w-0 flex-1 items-baseline gap-3 garden:flex">
          <span className="tabular text-[15px] opacity-85">{count} món</span>
          <span className="tabular text-[18px] font-bold">{formatCurrency(total)}đ</span>
        </span>
        <span className="min-w-0 flex-1 garden:hidden">
          <span className="block truncate text-small-m font-semibold">{tableLabel ? `${count} món · ${tableLabel}` : `${count} món đã chọn`}</span>
          <span className="block text-normal-sb font-bold">{formatCurrency(total)}đ</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-primary px-3.5 py-2 text-small-m font-bold garden:h-11 garden:rounded-[14px] garden:bg-white/15 garden:px-4 garden:text-[16px] garden:font-semibold">
          <span className="garden:hidden">Xem đơn</span><ArrowRightIcon className="size-4 garden:hidden" />
          <span className="hidden garden:inline">Xem giỏ</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="hidden size-[18px] garden:block"><path d="m9 6 6 6-6 6" /></svg>
        </span>
      </button>
    </StickyActionBar>
  );
}
