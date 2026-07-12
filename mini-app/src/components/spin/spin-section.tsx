import { useEffect, useRef, useState } from "react";
import { Button } from "zmp-ui";
import { spinService, SpinReward, SpinResult } from "@/services/spin/spin.api";
import SpinWheel, { targetRotation } from "./spin-wheel";

type Phase = "loading" | "hidden" | "idle" | "spinning" | "result";

// Vòng quay hiện DƯỚI trạng thái đơn khi đơn đã có tiền thật + quán bật tính năng.
// TỰ BỌC try/catch: mọi lỗi vòng quay chỉ khiến nó ẩn đi, KHÔNG ảnh hưởng trang đơn.
export default function SpinSection({ orderId }: { orderId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [rewards, setRewards] = useState<SpinReward[]>([]);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [rotation, setRotation] = useState(0);
  const [animate, setAnimate] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await spinService.getState(orderId);
        if (cancelled) return;
        if (st.status === "available") {
          setRewards(st.rewards);
          setRotation(0);
          setPhase("idle");
        } else if (st.status === "done") {
          setRewards(st.rewards);
          setResult(st.result);
          // đặt đĩa dừng sẵn ở ô trúng (không animation)
          const idx = st.rewards.findIndex((r) => r.id === st.result.reward_id);
          setRotation(idx >= 0 ? targetRotation(idx, st.rewards.length, 0) : 0);
          setPhase("result");
        } else {
          setPhase("hidden"); // not_eligible | disabled
        }
      } catch {
        if (!cancelled) setPhase("hidden"); // lỗi/timeout → im lặng bỏ qua
      }
    })();
    return () => {
      cancelled = true;
      if (revealTimer.current) clearTimeout(revealTimer.current);
    };
  }, [orderId]);

  const handleSpin = async () => {
    if (phase !== "idle") return;
    setPhase("spinning");
    try {
      const st = await spinService.spin(orderId);
      if (st.status !== "done") {
        setPhase("hidden");
        return;
      }
      const idx = st.rewards.findIndex((r) => r.id === st.result.reward_id);
      setResult(st.result);
      setRewards(st.rewards);
      setAnimate(true);
      setRotation(targetRotation(idx >= 0 ? idx : 0, st.rewards.length));
      revealTimer.current = setTimeout(() => setPhase("result"), 4400);
    } catch {
      setPhase("hidden"); // vòng quay chết KHÔNG được làm chết luồng đặt món
    }
  };

  if (phase === "loading" || phase === "hidden") return null;

  const isNone = result?.type === "none";

  return (
    <div className="mx-4 mt-4 overflow-hidden rounded-xl bg-white p-4">
      <p className="mb-3 text-center text-small-m font-bold text-primary">
        🎁 Vòng quay may mắn
      </p>

      <SpinWheel rewards={rewards} rotation={rotation} animate={animate} />

      {phase === "idle" && (
        <Button
          onClick={handleSpin}
          className="mt-4 w-full rounded-xl bg-primary py-3 font-semibold text-white active:opacity-80"
          fullWidth
        >
          Quay thưởng
        </Button>
      )}

      {phase === "spinning" && (
        <p className="mt-4 text-center text-small font-medium text-text-secondary">
          Đang quay...
        </p>
      )}

      {phase === "result" && result && (
        <div className="mt-4 rounded-xl border border-[#E8C9B3] bg-[#FBF4EF] p-4 text-center">
          {isNone ? (
            <p className="text-small font-semibold text-text-primary">
              Chúc bạn may mắn lần sau 🍀
            </p>
          ) : result.type === "voucher" ? (
            <>
              <p className="text-small text-text-secondary">🎉 Bạn trúng</p>
              <p className="mt-0.5 text-medium-m font-bold text-primary">
                {result.label}
              </p>
              <p className="mt-2 text-xxsmall text-text-secondary">
                Mã tự động áp dụng cho lần đặt món sau
                {result.voucher?.expires_at &&
                  ` • HSD ${new Date(result.voucher.expires_at).toLocaleDateString("vi-VN")}`}
              </p>
              <div className="mt-2 inline-block rounded-lg bg-white px-3 py-1.5">
                <span className="text-small font-bold tracking-widest text-text-primary">
                  {result.voucher?.code ?? result.code}
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="text-small text-text-secondary">🎉 Bạn trúng</p>
              <p className="mt-0.5 text-medium-m font-bold text-primary">
                {result.label}
              </p>
              <p className="mt-2 text-xxsmall text-text-secondary">
                Nhân viên sẽ mang ra cho bạn — hoặc đưa màn hình này để đổi
              </p>
              <div className="mt-2 inline-block rounded-lg bg-white px-3 py-1.5">
                <span className="text-small font-bold tracking-widest text-text-primary">
                  {result.code}
                </span>
              </div>
              {result.redeem_status === "redeemed" && (
                <p className="mt-2 text-xxsmall font-medium text-green-600">
                  ✓ Đã đổi thưởng
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
