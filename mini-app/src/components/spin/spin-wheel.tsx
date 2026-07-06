import { SpinReward } from "@/services/spin/spin.api";

// Màu xen kẽ các ô (dùng token primary cho ô lẻ để hợp theme quán)
const SEGMENT_COLORS = ["#F6C445", "#FF8A5B", "#FFD98A", "#F49E4C", "#FFC15E", "#EA9C3C"];

const SIZE = 260; // px

// Góc đưa ô index về đúng kim (đỉnh). Ô i chiếm [i*seg,(i+1)*seg] tính từ đỉnh theo chiều kim.
export function targetRotation(index: number, count: number, turns = 5): number {
  const seg = 360 / count;
  const center = index * seg + seg / 2;
  return turns * 360 + ((360 - center) % 360);
}

export default function SpinWheel({
  rewards,
  rotation,
  animate,
}: {
  rewards: SpinReward[];
  rotation: number;
  animate: boolean;
}) {
  const n = rewards.length;
  const seg = 360 / n;
  const stops = rewards
    .map((_, i) => {
      const c = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      return `${c} ${i * seg}deg ${(i + 1) * seg}deg`;
    })
    .join(", ");

  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      {/* Kim chỉ ở đỉnh */}
      <div
        className="absolute left-1/2 z-20 -translate-x-1/2"
        style={{
          top: -6,
          width: 0,
          height: 0,
          borderLeft: "12px solid transparent",
          borderRight: "12px solid transparent",
          borderTop: "20px solid #D64545",
          filter: "drop-shadow(0 1px 1px rgba(0,0,0,.3))",
        }}
      />
      {/* Đĩa quay */}
      <div
        className="rounded-full border-4 border-white shadow-lg"
        style={{
          width: SIZE,
          height: SIZE,
          background: `conic-gradient(${stops})`,
          transform: `rotate(${rotation}deg)`,
          transition: animate
            ? "transform 4.2s cubic-bezier(0.17, 0.67, 0.12, 0.99)"
            : "none",
        }}
      >
        {rewards.map((r, i) => {
          // Đặt nhãn gần vành, giữa mỗi ô, chữ để THẲNG cho dễ đọc (không xoay từng nhãn).
          const angle = i * seg + seg / 2; // độ, theo chiều kim tính từ đỉnh
          const rad = ((angle - 90) * Math.PI) / 180;
          const dist = SIZE * 0.32; // khoảng cách từ tâm ra (≈83px, vành ở 130px)
          const x = SIZE / 2 + dist * Math.cos(rad);
          const y = SIZE / 2 + dist * Math.sin(rad);
          return (
            <div
              key={r.id}
              className="absolute flex items-center justify-center"
              style={{
                left: x,
                top: y,
                width: 74,
                transform: "translate(-50%, -50%)",
              }}
            >
              <span
                className="line-clamp-3 text-center text-[9px] font-bold leading-tight text-white"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,.4)" }}
              >
                {r.label}
              </span>
            </div>
          );
        })}
      </div>
      {/* Trục giữa */}
      <div
        className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-primary shadow"
        style={{ width: 36, height: 36 }}
      />
    </div>
  );
}
