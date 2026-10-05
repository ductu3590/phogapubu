import { useEffect, useState } from "react";
import { openWebview } from "zmp-sdk";
import { useSnackbar } from "zmp-ui";
import { useAppStore } from "@/stores/app.store";
import PermissionSheet from "@/components/common/permission-sheet";
import { useOaFollow } from "@/hooks/use-oa-follow";
import TermsSheet from "@/components/common/terms-sheet";
import { DEFAULT_TERMS } from "@/constants/terms";
import { ScanLineIcon, UtensilsIcon, MapPinIcon, BikeIcon, PhoneIcon, WifiIcon, FileTextIcon, MessageCircleIcon, BellIcon } from "@/components/common/icons";

// "Bia lẩu Bảo Lương" → "BL" (giống chữ viết tắt trên thanh công cụ).
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const picked = words.length >= 2 ? [words[0], words[words.length - 1]] : words;
  return picked.map((w) => w[0]).join("").toUpperCase();
}

function InfoRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <button
      onClick={onPress}
      disabled={!onPress}
      className="flex w-full items-start gap-3 border-b border-neutral100 px-4 py-3 last:border-0 text-left disabled:cursor-default"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&>svg]:size-4">{icon}</span>
      <div>
        <p className="text-xxsmall text-text-secondary">{label}</p>
        <p className="text-small text-text-primary">{value}</p>
      </div>
    </button>
  );
}

export default function StoreInfoPage() {
  const { storeId, storeName, storeLogoUrl, storeAddress, storePhone, zaloOaId, zaloOaUrl, aboutText, wifiName, wifiPassword, deliveryAreaNote, termsOfUse } =
    useAppStore();
  const { openSnackbar } = useSnackbar();

  // Sao chép mật khẩu wifi: ưu tiên Clipboard API, nếu bị chặn thì fallback textarea + execCommand
  const handleCopyWifi = async () => {
    const copyViaExecCommand = (): boolean => {
      try {
        const ta = document.createElement("textarea");
        ta.value = wifiPassword;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    };

    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(wifiPassword);
        copied = true;
      } catch {
        // Clipboard API bị chặn (quyền / webview) → thử cách cũ
        copied = copyViaExecCommand();
      }
    } else {
      copied = copyViaExecCommand();
    }

    openSnackbar(
      copied
        ? { text: "Đã sao chép mật khẩu wifi", type: "success" }
        : { text: "Không sao chép được, vui lòng thử lại", type: "error" },
    );
  };

  // Key mới (v2) — bỏ qua cờ "granted" cũ vốn set cả khi user từ chối, khiến prompt
  // biến mất vĩnh viễn. "connected" chỉ true khi user thực sự quan tâm OA thành công.
  // Trạng thái quan tâm dùng chung với nút "Quan tâm" trên thanh công cụ (hooks/use-oa-follow).
  const oa = useOaFollow();
  const isConnected = oa.connected;
  const SHEET_SESSION_KEY = storeId ? `mevo_oa_sheet_${storeId}` : "";

  const [showPermSheet, setShowPermSheet] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const termsContent = termsOfUse.trim() || DEFAULT_TERMS;

  // Tự bật sheet 1 lần MỖI PHIÊN (khi chưa kết nối) — dùng sessionStorage để mỗi lần
  // mở lại app sẽ mời lại, nhưng không phiền trong cùng phiên.
  useEffect(() => {
    if (!storeId || !zaloOaId || isConnected) return;
    if (sessionStorage.getItem(SHEET_SESSION_KEY)) return;
    sessionStorage.setItem(SHEET_SESSION_KEY, "1");
    setShowPermSheet(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, zaloOaId, isConnected]);

  const handleGranted = (followed: boolean) => {
    if (followed) oa.markConnected();
    setShowPermSheet(false);
  };

  // "Để sau" — chỉ đóng sheet phiên này; CTA card vẫn còn để khách tự bấm lại.
  const handleDismiss = () => {
    setShowPermSheet(false);
  };

  if (!storeId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <ScanLineIcon className="size-10 text-text-disabled" />
        <p className="font-medium text-text-primary">Quét QR tại bàn trước</p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col overflow-y-auto bg-background pb-6"
    >
      {/* Card thông tin quán */}
      <div className="mx-3 mt-3 overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.06)] p-4">
        <div className="flex items-center gap-4">
          {storeLogoUrl ? (
            <img
              src={storeLogoUrl}
              alt={storeName}
              className="size-16 shrink-0 rounded-2xl object-cover"
            />
          ) : (
            <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary text-large-m font-bold text-white">
              {initials(storeName) || <UtensilsIcon className="size-7" />}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-large-m font-bold text-text-primary">{storeName}</h1>
            <p className="mt-0.5 text-xxsmall text-text-secondary">Thông tin nhà hàng</p>
          </div>
        </div>
        {aboutText && (
          <p className="mt-3 whitespace-pre-line border-t border-neutral100 pt-3 text-small text-text-secondary">{aboutText}</p>
        )}
      </div>

      {/* Card liên hệ */}
      {(storeAddress || storePhone || wifiName || deliveryAreaNote) && (
        <div className="mx-3 mt-3 overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <p className="px-4 pb-1 pt-3 text-xxsmall font-bold uppercase tracking-wide text-text-secondary">Liên hệ</p>
          {storeAddress && <InfoRow icon={<MapPinIcon />} label="Địa chỉ" value={storeAddress} />}
          {deliveryAreaNote && <InfoRow icon={<BikeIcon />} label="Phạm vi ship" value={deliveryAreaNote} />}
          {storePhone && (
            <InfoRow
              icon={<PhoneIcon />}
              label="Điện thoại"
              value={storePhone}
              onPress={() => { window.location.href = `tel:${storePhone}`; }}
            />
          )}
          {/* Wifi — hiện ngay dưới Điện thoại; wifi_name rỗng thì không render */}
          {wifiName && (
            <div className="flex items-start gap-3 border-b border-neutral100 px-4 py-3 last:border-0">
              <WifiIcon className="mt-0.5 size-5 shrink-0 text-text-secondary" />
              <div className="flex-1">
                <p className="text-xxsmall text-text-secondary">Wifi</p>
                <p className="text-small text-text-primary">
                  {wifiName}
                  {wifiPassword ? ` · ${wifiPassword}` : ""}
                </p>
              </div>
              {wifiPassword && (
                <button
                  onClick={handleCopyWifi}
                  className="shrink-0 self-center rounded-lg bg-primary/10 px-3 py-1.5 text-xxsmall font-semibold text-primary active:opacity-70"
                >
                  Sao chép
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Card: Điều khoản sử dụng (luôn hiện) + Trang Zalo chính thức (nếu có) */}
      <div className="mx-3 mt-3 overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        {/* Điều khoản sử dụng — luôn hiện; rỗng thì dùng DEFAULT_TERMS */}
        <button
          onClick={() => setShowTerms(true)}
          className="flex w-full items-center gap-3 border-b border-neutral100 px-4 py-3 text-left last:border-0 active:bg-neutral50"
        >
          <FileTextIcon className="size-5 shrink-0 text-text-secondary" />
          <div className="flex-1">
            <p className="text-small text-primary">Điều khoản sử dụng</p>
          </div>
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 text-neutral300"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Trang Zalo chính thức — link sang trang Zalo OA */}
        {zaloOaUrl && (
          <button
            onClick={() => void openWebview({ url: zaloOaUrl })}
            className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-neutral50"
          >
            <MessageCircleIcon className="size-5 shrink-0 text-text-secondary" />
            <div className="flex-1">
              <p className="text-xxsmall text-text-secondary">Trang Zalo chính thức</p>
              <p className="text-small text-primary">Xem trang Zalo OA của nhà hàng</p>
            </div>
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-neutral300"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* CTA card xin quyền — hiện mỗi lần vào tab cho đến khi thực sự kết nối */}
      {zaloOaId && !isConnected && (
        <div className="mx-3 mt-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="flex items-center gap-1.5 text-small-m font-semibold text-text-primary"><BellIcon className="size-4 text-primary" />Kết nối để nhận ưu đãi</p>
          <p className="mt-0.5 text-xxsmall text-text-secondary">
            Thông báo khi món xong + điền form nhanh hơn.
          </p>
          <button
            onClick={() => setShowPermSheet(true)}
            className="mt-2.5 h-11 w-full rounded-xl bg-primary text-small-m font-bold text-white active:opacity-80"
          >
            Kết nối với {storeName}
          </button>
        </div>
      )}


      {/* Sheet điều khoản sử dụng */}
      <TermsSheet
        visible={showTerms}
        content={termsContent}
        onClose={() => setShowTerms(false)}
      />

      {/* Permission bottom sheet */}
      {zaloOaId && (
        <PermissionSheet
          oaId={zaloOaId}
          visible={showPermSheet}
          onClose={handleDismiss}
          onGranted={handleGranted}
        />
      )}
    </div>
  );
}
