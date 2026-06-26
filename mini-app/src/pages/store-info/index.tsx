import { useEffect, useState } from "react";
import { followOA, openWebview, authorize } from "zmp-sdk";
import { useAppStore } from "@/stores/app.store";

// ─── InfoRow ──────────────────────────────────────────────────────────────────
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

// ─── StoreInfoPage ────────────────────────────────────────────────────────────
export default function StoreInfoPage() {
  const { storeId, storeName, storeLogoUrl, storeAddress, storePhone, zaloOaId, zaloOaUrl } =
    useAppStore();

  const FOLLOWED_KEY = storeId ? `mevo_oa_followed_${storeId}` : "";
  const AUTHORIZED_KEY = storeId ? `mevo_authorized_${storeId}` : "";

  const [followed, setFollowed] = useState(
    () => !!storeId && !!localStorage.getItem(`mevo_oa_followed_${storeId}`),
  );
  const [following, setFollowing] = useState(false);

  // Khi store data load xong → auto gọi followOA + authorize nếu chưa làm
  useEffect(() => {
    if (!storeId || !zaloOaId) return;

    // Xin quyền thông tin user (một lần) — dùng để cá nhân hoá sau này
    if (!localStorage.getItem(AUTHORIZED_KEY)) {
      void authorize({ scopes: ["scope.userInfo"] })
        .then(() => { localStorage.setItem(AUTHORIZED_KEY, "1"); })
        .catch(() => { /* ignore: dev env hoặc user từ chối */ });
    }

    // Auto gọi native Zalo OA follow sheet mỗi lần vào tab nếu chưa follow
    if (!localStorage.getItem(FOLLOWED_KEY)) {
      void followOA({ id: zaloOaId })
        .then(() => {
          setFollowed(true);
          localStorage.setItem(FOLLOWED_KEY, "1");
        })
        .catch(() => { /* -201 = user từ chối, bỏ qua */ });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, zaloOaId]);

  // Bấm thủ công nút "Quan tâm"
  async function handleFollowOA() {
    if (!zaloOaId || following) return;
    setFollowing(true);
    try {
      await followOA({ id: zaloOaId });
      setFollowed(true);
      localStorage.setItem(FOLLOWED_KEY, "1");
    } catch (err: unknown) {
      const code = (err as { error?: number })?.error;
      if (code !== -201) console.warn("[StoreInfo] followOA error:", err);
    } finally {
      setFollowing(false);
    }
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!storeId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-4xl">📷</div>
        <p className="font-medium text-text-primary">Quét QR tại bàn trước</p>
      </div>
    );
  }

  // ── Main content ─────────────────────────────────────────────────────────────
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
      {(storeAddress || storePhone) && (
        <div className="mx-3.5 mt-3 overflow-hidden rounded-xl bg-white">
          {storeAddress && <InfoRow icon="📍" label="Địa chỉ" value={storeAddress} />}
          {storePhone && (
            <InfoRow
              icon="📞"
              label="Điện thoại"
              value={storePhone}
              onPress={() => { window.location.href = `tel:${storePhone}`; }}
            />
          )}
        </div>
      )}

      {/* Card Zalo OA */}
      {(zaloOaId || zaloOaUrl) && (
        <div className="mx-3.5 mt-3 overflow-hidden rounded-xl bg-white">
          {/* Hàng "Quan tâm" — nhận thông báo ZNS */}
          {zaloOaId && (
            <div className="flex items-center justify-between border-b border-neutral100 px-4 py-3">
              <div>
                <p className="text-small-m font-semibold text-text-primary">Nhận thông báo Zalo</p>
                <p className="mt-0.5 text-xxsmall text-text-secondary">
                  Quan tâm OA để nhận thông báo khi món xong
                </p>
              </div>
              {followed ? (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xxsmall font-semibold text-green-700">
                  Đã quan tâm
                </span>
              ) : (
                <button
                  onClick={handleFollowOA}
                  disabled={following}
                  className="rounded-full bg-primary px-3 py-1 text-xxsmall font-semibold text-white disabled:opacity-60"
                >
                  {following ? "..." : "Quan tâm"}
                </button>
              )}
            </div>
          )}

          {/* Hàng "Trang Zalo OA" — mở webview */}
          {zaloOaUrl && (
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
          )}
        </div>
      )}
    </div>
  );
}
