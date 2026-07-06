import { useEffect, useState } from "react";
import { openWebview } from "zmp-sdk";
import { useSnackbar } from "zmp-ui";
import { useAppStore } from "@/stores/app.store";
import PermissionSheet from "@/components/common/permission-sheet";

function InfoRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: string;
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
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-xxsmall text-text-secondary">{label}</p>
        <p className="text-small text-text-primary">{value}</p>
      </div>
    </button>
  );
}

export default function StoreInfoPage() {
  const { storeId, storeName, storeLogoUrl, storeAddress, storePhone, zaloOaId, zaloOaUrl, aboutText, wifiName, wifiPassword, deliveryAreaNote } =
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
  const CONNECTED_KEY = storeId ? `mevo_oa_connected_v2_${storeId}` : "";
  const SHEET_SESSION_KEY = storeId ? `mevo_oa_sheet_${storeId}` : "";

  const [showPermSheet, setShowPermSheet] = useState(false);
  const [isConnected, setIsConnected] = useState(
    () => !!storeId && !!localStorage.getItem(`mevo_oa_connected_v2_${storeId}`),
  );

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
    if (followed && CONNECTED_KEY) {
      localStorage.setItem(CONNECTED_KEY, "1");
      setIsConnected(true);
    }
    setShowPermSheet(false);
  };

  // "Để sau" — chỉ đóng sheet phiên này; CTA card vẫn còn để khách tự bấm lại.
  const handleDismiss = () => {
    setShowPermSheet(false);
  };

  if (!storeId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-4xl">📷</div>
        <p className="font-medium text-text-primary">Quét QR tại bàn trước</p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col overflow-y-auto bg-background"
      style={{ paddingTop: "calc(var(--zaui-safe-area-inset-top, 0px) + 16px)" }}
    >
      {/* Card thông tin quán */}
      <div className="mx-3.5 rounded-xl bg-white px-4 py-4">
        <div className="flex items-center gap-4">
          {storeLogoUrl ? (
            <img
              src={storeLogoUrl}
              alt={storeName}
              className="h-20 w-20 rounded-2xl object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-4xl">
              🍽️
            </div>
          )}
          <div>
            <h1 className="text-medium-m font-bold text-text-primary">{storeName}</h1>
          </div>
        </div>
      </div>

      {/* Card liên hệ */}
      {(storeAddress || storePhone || wifiName || deliveryAreaNote) && (
        <div className="mx-3.5 mt-3 overflow-hidden rounded-xl bg-white">
          {storeAddress && <InfoRow icon="📍" label="Địa chỉ" value={storeAddress} />}
          {deliveryAreaNote && <InfoRow icon="🛵" label="Phạm vi ship" value={deliveryAreaNote} />}
          {storePhone && (
            <InfoRow
              icon="📞"
              label="Điện thoại"
              value={storePhone}
              onPress={() => { window.location.href = `tel:${storePhone}`; }}
            />
          )}
          {/* Wifi — hiện ngay dưới Điện thoại; wifi_name rỗng thì không render */}
          {wifiName && (
            <div className="flex items-start gap-3 border-b border-neutral100 px-4 py-3 last:border-0">
              <span className="text-xl">📶</span>
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

      {/* Card Zalo OA — link sang trang Zalo chính thức */}
      {zaloOaUrl && (
        <div className="mx-3.5 mt-3 overflow-hidden rounded-xl bg-white">
          <button
            onClick={() => void openWebview({ url: zaloOaUrl })}
            className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-neutral50"
          >
            <span className="text-xl">💬</span>
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
        </div>
      )}

      {/* CTA card xin quyền — hiện mỗi lần vào tab cho đến khi thực sự kết nối */}
      {zaloOaId && !isConnected && (
        <div className="mx-3.5 mt-3 rounded-xl border border-[#E8C9B3] bg-[#FBF4EF] px-4 py-3">
          <p className="text-small-m font-semibold text-text-primary">🔔 Kết nối để nhận ưu đãi</p>
          <p className="mt-0.5 text-xxsmall text-text-secondary">
            Thông báo khi món xong + điền form nhanh hơn.
          </p>
          <button
            onClick={() => setShowPermSheet(true)}
            className="mt-2.5 w-full rounded-xl bg-primary py-2.5 text-small font-semibold text-white active:opacity-80"
          >
            Kết nối với {storeName}
          </button>
        </div>
      )}

      {/* Ghi chú / Lời nhắn từ quán */}
      {aboutText && (
        <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-3">
          <p className="whitespace-pre-line text-small text-text-secondary">{aboutText}</p>
        </div>
      )}

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
