import { CalendarDaysIcon, ClockIcon, MapPinIcon, PhoneIcon, ScanLineIcon } from "@/components/common/icons";
import StatusPill from "@/components/ui/status-pill";
import DirectionsButton from "@/components/ui/directions-button";
import { directionsUrl } from "@/utils/directions";
import { formatServingHours, isStoreOpen, type ServingShift } from "@/utils/store-hours";

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const picked = words.length >= 2 ? [words[0], words[words.length - 1]] : words;
  return picked.map((w) => w[0]).join("").toUpperCase();
}

// Phần đầu Trang chủ (Stitch m01) ở lối vào thường. Chỉ dữ liệu thật của quán:
// ảnh bìa / logo, địa chỉ + Chỉ đường, giờ phục vụ + Đang mở/Đã đóng cửa, gọi điện, CTA đặt bàn,
// lời nhắc quét QR tại bàn. Bỏ các nhãn Stitch bịa ("Giữ chỗ trong 15s", "Sân vườn & VIP"…).
export default function HomeHero({
  storeName,
  logoUrl,
  bannerUrl,
  address,
  mapsUrl,
  phone,
  servingHours,
  isAcceptingOrders,
  canReserve,
  onReserve,
  showScanHint,
}: {
  storeName: string;
  logoUrl: string;
  bannerUrl: string;
  address: string;
  mapsUrl: string;
  phone: string;
  servingHours: ServingShift[];
  isAcceptingOrders: boolean;
  canReserve: boolean;
  onReserve: () => void;
  showScanHint: boolean;
}) {
  const open = isStoreOpen({ isAcceptingOrders, servingHours });
  const hours = formatServingHours(servingHours);
  const directions = directionsUrl(mapsUrl, address);

  return (
    <div className="px-3 pt-3">
      <section className="overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        {/* Ảnh bìa: banner quán; chưa có thì khối màu chủ đạo + logo/chữ viết tắt + tên quán */}
        {bannerUrl ? (
          <div className="relative">
            <img src={bannerUrl} alt={storeName} className="aspect-[16/9] w-full object-cover" draggable={false} />
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-primary px-4 py-5">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="size-14 rounded-2xl object-cover ring-2 ring-white/40" draggable={false} />
            ) : (
              <span className="grid size-14 place-items-center rounded-2xl bg-white/20 text-large-m font-bold text-white">{initials(storeName)}</span>
            )}
            <p className="min-w-0 text-large-m font-bold leading-tight text-white">{storeName}</p>
          </div>
        )}

        <div className="space-y-2.5 p-4">
          {address && (
            <div className="flex items-start gap-2.5">
              <MapPinIcon className="mt-0.5 size-4 shrink-0 text-text-secondary" />
              <p className="min-w-0 flex-1 text-small text-text-primary">{address}</p>
              {directions && <DirectionsButton url={directions} />}
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <ClockIcon className="size-4 shrink-0 text-text-secondary" />
            <p className="min-w-0 flex-1 text-small text-text-primary">{hours ? `Mở cửa: ${hours}` : "Mở cả ngày"}</p>
            <StatusPill tone={open ? "success" : "critical"}>{open ? "Đang mở" : isAcceptingOrders ? "Đã đóng cửa" : "Tạm nghỉ"}</StatusPill>
          </div>
          {phone && (
            <a href={`tel:${phone}`} className="flex items-center gap-2.5">
              <PhoneIcon className="size-4 shrink-0 text-text-secondary" />
              <span className="text-small font-semibold text-primary">{phone}</span>
            </a>
          )}

          {canReserve && (
            <button
              type="button"
              onClick={onReserve}
              className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-normal-sb font-bold text-white shadow active:opacity-90"
            >
              <CalendarDaysIcon className="size-5" />
              Đặt bàn trước
            </button>
          )}
        </div>
      </section>

      {showScanHint && (
        <div className="mt-3 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-primary">
            <ScanLineIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-small-m font-bold text-text-primary">Quý khách đang ngồi tại quán?</p>
            <p className="mt-0.5 text-xxsmall text-text-secondary">Quét mã QR dán trên bàn để gọi món, xem tạm tính và gọi nhân viên.</p>
          </div>
        </div>
      )}
    </div>
  );
}
