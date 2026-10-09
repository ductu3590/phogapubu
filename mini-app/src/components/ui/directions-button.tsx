import { openWebview } from "zmp-sdk";
import { MapPinIcon } from "@/components/common/icons";
import { isZaloWebview, openExternal } from "@/utils/open-external";
import { cn } from "@/utils/cn";

// Nút "Chỉ đường" (spec Q9). Trong Zalo mở trang Google Maps bằng openWebview (API chính thức — openOutApp
// không được Zalo hỗ trợ, bấm không có tác dụng); ngoài Zalo (npm run dev) mở tab trình duyệt (utils/open-external).
export default function DirectionsButton({ url, className }: { url: string; className?: string }) {
  const open = () =>
    openExternal(url, {
      inZalo: isZaloWebview(navigator.userAgent),
      openInZalo: openWebview,
      fallback: (link) => window.open(link, "_blank", "noopener"),
    });
  return (
    <button
      type="button"
      onClick={open}
      className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 self-center rounded-full bg-primary/10 px-3 text-xxsmall font-bold text-primary active:opacity-70", className)}
    >
      <MapPinIcon className="size-4" />
      Chỉ đường
    </button>
  );
}
