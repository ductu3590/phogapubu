import { useCallback, useEffect, useState } from "react";
import { authorize, getSetting, getUserInfo } from "zmp-sdk";
import { useSnackbar } from "zmp-ui";
import SectionCard from "@/components/ui/section-card";
import ConfirmSheet from "@/components/ui/confirm-sheet";
import TermsSheet from "@/components/common/terms-sheet";
import { FileTextIcon, LockIcon, PhoneIcon, UserIcon } from "@/components/common/icons";
import { DEFAULT_TERMS } from "@/constants/terms";
import { useAppStore } from "@/stores/app.store";
import { getReservationProfile, saveReservationProfile } from "@/services/reservation/reservation-storage";
import { clearPersonalData } from "@/services/account-storage";
import { fetchZaloPhone, zaloPhoneErrorMessage } from "@/services/zalo-phone";
import { formatPhoneDisplay, mergeProfile, type ProfilePatch } from "@/utils/account-profile";
import { normalizeVnPhone } from "@/utils/booking-validation";
import { missingScopes } from "@/utils/account-permissions";
import type { ReservationProfile } from "@/types/reservation.types";

// Trang Tài khoản (spec 2026-10-09): hồ sơ + quyền riêng tư. Mọi thông tin chỉ nằm trên máy khách.
const EMPTY: ReservationProfile = { customerName: "", customerPhone: "" };

export default function AccountPage() {
  const { storeId, termsOfUse } = useAppStore();
  const { openSnackbar } = useSnackbar();

  const [profile, setProfile] = useState<ReservationProfile>(() => getReservationProfile(storeId) ?? EMPTY);
  const [nameDraft, setNameDraft] = useState(profile.customerName);
  const [zaloUser, setZaloUser] = useState<{ name: string; avatar: string } | null>(null);
  const [fromZalo, setFromZalo] = useState(false);
  const [fetchingPhone, setFetchingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPhone, setManualPhone] = useState("");
  const [manualError, setManualError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  // Đọc lại từ storage mỗi lần ghi — tránh đè thay đổi của form khác bằng state cũ.
  const update = useCallback((patch: ProfilePatch, overwriteName: boolean) => {
    const next = mergeProfile(getReservationProfile(storeId), patch, { overwriteName });
    saveReservationProfile(storeId, next);
    setProfile(next);
    return next;
  }, [storeId]);

  const applyZaloUser = useCallback((info: { name: string; avatar: string }) => {
    setZaloUser({ name: info.name, avatar: info.avatar });
    // Tên Zalo chỉ điền khi hồ sơ chưa có tên — không đè tên khách đã tự sửa.
    const next = update({ customerName: info.name }, false);
    setNameDraft(next.customerName);
  }, [update]);

  const getPhoneFromZalo = useCallback(async () => {
    setFetchingPhone(true);
    setPhoneError("");
    const result = await fetchZaloPhone(storeId);
    setFetchingPhone(false);
    if (result.ok) {
      update({ customerPhone: result.phone }, false);
      setFromZalo(true);
      setManualOpen(false);
      return;
    }
    setPhoneError(zaloPhoneErrorMessage(result.error));
    setManualOpen(true);
  }, [storeId, update]);

  // Mở trang là xin luôn quyền tên/ảnh/ID + SĐT (hộp xin quyền của Zalo), cấp xong tự đọc tên và lấy số.
  // Chỉ xin 1 lần mỗi phiên mở app: khách đã từ chối thì không hỏi lại mỗi lần vào trang
  // (còn nút "Kết nối Zalo" / "Lấy số từ Zalo" để tự bấm). Chờ có storeId — chưa có thì không có secret quán để đổi số.
  useEffect(() => {
    if (!storeId) return;
    let alive = true;
    (async () => {
      try {
        let { authSetting } = await getSetting();
        const missing = missingScopes(authSetting);
        const askedKey = `mevo_account_perm_asked_${storeId}`;
        let alreadyAsked = false;
        try { alreadyAsked = sessionStorage.getItem(askedKey) === "1"; } catch { /* không có sessionStorage */ }
        if (missing.length > 0 && !alreadyAsked) {
          try { sessionStorage.setItem(askedKey, "1"); } catch { /* bỏ qua */ }
          try { await authorize({ scopes: missing }); } catch { /* khách từ chối — vẫn dùng nhập tay */ }
          ({ authSetting } = await getSetting());
        }
        if (authSetting?.["scope.userInfo"]) {
          const { userInfo } = await getUserInfo({ avatarType: "normal" });
          if (alive && userInfo?.name) applyZaloUser(userInfo);
        }
        if (alive && authSetting?.["scope.userPhonenumber"] && !getReservationProfile(storeId)?.customerPhone) {
          await getPhoneFromZalo();
        }
      } catch { /* không đọc được thì giữ "Khách" */ }
    })();
    return () => { alive = false; };
  }, [storeId, applyZaloUser, getPhoneFromZalo]);

  const connectZalo = async () => {
    try {
      const { userInfo } = await getUserInfo({ autoRequestPermission: true, avatarType: "normal" });
      if (userInfo?.name) applyZaloUser(userInfo);
    } catch { /* khách từ chối — giữ "Khách", không báo lỗi to */ }
  };

  const saveManualPhone = () => {
    const normalized = normalizeVnPhone(manualPhone);
    if (!normalized.ok) { setManualError(normalized.error); return; }
    update({ customerPhone: normalized.value }, false);
    setFromZalo(false);
    setManualOpen(false);
    setManualPhone("");
    setManualError("");
    setPhoneError("");
    openSnackbar({ text: "Đã lưu số điện thoại", type: "success" });
  };

  const saveName = () => {
    if (nameDraft.trim() === profile.customerName) return;
    const next = update({ customerName: nameDraft }, true);
    setNameDraft(next.customerName);
  };

  const clearAll = () => {
    clearPersonalData(storeId);
    setProfile(EMPTY);
    setNameDraft("");
    setZaloUser(null);
    setFromZalo(false);
    setManualOpen(false);
    setPhoneError("");
    setConfirmClear(false);
    openSnackbar({ text: "Đã xoá thông tin cá nhân trên máy này", type: "success" });
  };

  const hasPhone = !!profile.customerPhone;

  return (
    <div className="pb-6">
      {/* Thẻ hồ sơ */}
      <section className="mx-3 mt-3 flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        {zaloUser?.avatar ? (
          <img src={zaloUser.avatar} alt="" className="size-14 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><UserIcon className="size-7" /></span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-large-m font-bold text-text-primary">{zaloUser?.name || profile.customerName || "Khách"}</p>
          {zaloUser ? (
            <p className="mt-0.5 text-xxsmall text-text-secondary">Đã kết nối tài khoản Zalo</p>
          ) : (
            <button type="button" onClick={() => void connectZalo()} className="mt-1 text-small-m font-semibold text-primary">
              Kết nối Zalo
            </button>
          )}
        </div>
      </section>

      {/* Thông tin liên hệ */}
      <SectionCard title="Thông tin liên hệ" subtitle="Tự điền khi bạn đặt bàn, đặt món mang về" icon={<PhoneIcon />}>
        <label className="block text-xxsmall text-text-secondary" htmlFor="account-name">Tên</label>
        <input
          id="account-name"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={saveName}
          placeholder="Tên để quán gọi bạn"
          className="mt-1 h-12 w-full rounded-xl border border-neutral200 px-3 text-normal text-text-primary outline-none focus:border-primary"
        />

        <p className="mt-3 text-xxsmall text-text-secondary">Số điện thoại</p>
        {hasPhone ? (
          <div className="mt-1 flex h-12 items-center justify-between rounded-xl border border-neutral200 pl-3 pr-2">
            <span className="text-normal font-semibold text-text-primary">{formatPhoneDisplay(profile.customerPhone)}</span>
            <button
              type="button"
              onClick={() => void getPhoneFromZalo()}
              disabled={fetchingPhone}
              className="rounded-full bg-primary/10 px-3 py-1.5 text-xxsmall font-semibold text-primary disabled:opacity-50"
            >
              {fetchingPhone ? "Đang lấy…" : "Cập nhật"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void getPhoneFromZalo()}
            disabled={fetchingPhone}
            className="mt-1 h-12 w-full rounded-xl bg-[#0068FF] text-small-m font-semibold text-white disabled:opacity-60"
          >
            {fetchingPhone ? "Đang lấy số…" : "Lấy số từ Zalo"}
          </button>
        )}
        {hasPhone && fromZalo && !phoneError && (
          <p className="mt-2 text-xxsmall text-success">Đã lấy từ Zalo · sẽ điền sẵn khi đặt bàn</p>
        )}
        {phoneError && <p className="mt-2 text-xxsmall text-critical">{phoneError}</p>}

        {manualOpen ? (
          <div className="mt-3 flex gap-2">
            <input
              value={manualPhone}
              onChange={(e) => { setManualPhone(e.target.value); setManualError(""); }}
              inputMode="tel"
              placeholder="0962 345 678"
              aria-label="Nhập số điện thoại"
              className="h-12 min-w-0 flex-1 rounded-xl border border-neutral200 px-3 text-normal outline-none focus:border-primary"
            />
            <button type="button" onClick={saveManualPhone} className="h-12 shrink-0 rounded-xl bg-primary px-4 text-small-m font-semibold text-white">
              Lưu
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setManualOpen(true)} className="mt-2 w-full text-center text-small-m font-semibold text-primary">
            Nhập tay
          </button>
        )}
        {manualError && <p className="mt-1 text-xxsmall text-critical">{manualError}</p>}
      </SectionCard>

      {/* Quyền riêng tư */}
      <SectionCard title="Quyền riêng tư" icon={<LockIcon />}>
        <p className="text-small text-text-secondary">
          Tên và số điện thoại chỉ lưu trên điện thoại này để điền sẵn khi đặt bàn. Quán chỉ nhận khi bạn gửi đơn.
        </p>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="mt-3 h-11 w-full rounded-xl border border-critical/40 text-small-m font-semibold text-critical"
        >
          Xoá thông tin cá nhân
        </button>
        <p className="mt-3 text-xxsmall text-text-secondary">
          Muốn thu hồi quyền Zalo đã cấp: Zalo → Cá nhân → Cài đặt → Quyền riêng tư → Ứng dụng đã cấp quyền.
        </p>
        <button
          type="button"
          onClick={() => setTermsOpen(true)}
          className="mt-3 flex w-full items-center gap-2 border-t border-neutral100 pt-3 text-left text-small-m text-text-primary"
        >
          <FileTextIcon className="size-4 text-text-secondary" />
          <span className="flex-1">Điều khoản sử dụng</span>
          <span className="text-text-secondary">›</span>
        </button>
      </SectionCard>

      <p className="mt-4 text-center text-xxsmall text-text-secondary">Vận hành bởi MEVO</p>

      <ConfirmSheet
        open={confirmClear}
        title="Xoá thông tin cá nhân?"
        description="Tên, số điện thoại và thông tin đang điền dở trên máy này sẽ bị xoá. Lịch đặt bàn và đơn đang gọi vẫn giữ nguyên."
        confirmLabel="Xoá"
        danger
        onConfirm={clearAll}
        onClose={() => setConfirmClear(false)}
      />
      <TermsSheet visible={termsOpen} content={termsOfUse.trim() || DEFAULT_TERMS} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
