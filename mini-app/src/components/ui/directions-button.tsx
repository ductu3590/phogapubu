import { openWebview } from "zmp-sdk";
import { MapPinIcon } from "@/components/common/icons";
import { cn } from "@/utils/cn";

// Nút "Chỉ đường" (spec Q9) — mở link Google Maps trong webview của Zalo. Ngoài Zalo (npm run dev)
// openWebview lỗi → mở tab mới cho dễ thử.
export default function DirectionsButton({ url, className }: { url: string; className?: string }) {
  const open = () => {
    openWebview({ url }).catch(() => window.open(url, "_blank", "noopener"));
  };
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
