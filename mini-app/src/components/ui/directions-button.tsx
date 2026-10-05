import { openOutApp } from "zmp-sdk";
import { MapPinIcon } from "@/components/common/icons";
import { isZaloWebview, openExternal } from "@/utils/open-external";
import { cn } from "@/utils/cn";

// Nút "Chỉ đường" (spec Q9). Trong Zalo mở thẳng ứng dụng Google Maps (openOutApp) để khách được
// dẫn đường; ngoài Zalo (npm run dev) SDK không mở gì nên mở tab trình duyệt (xem utils/open-external).
export default function DirectionsButton({ url, className }: { url: string; className?: string }) {
  const open = () =>
    openExternal(url, {
      inZalo: isZaloWebview(navigator.userAgent),
      openOutApp,
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
