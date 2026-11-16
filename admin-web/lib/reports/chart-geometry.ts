// Hình học thuần cho biểu đồ SVG của trang Báo cáo (không phụ thuộc React).

export type WaterfallStep = { label: string; value: number; kind: 'total' | 'delta' }

/** Mốc trục "đẹp" ≥ v: step = 10^floor(log10 v), làm tròn lên bội của 2*step. v <= 0 → 1. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const step = Math.pow(10, Math.floor(Math.log10(value)))
  return Math.ceil(value / step / 2) * step * 2
}

const f1 = (n: number) => n.toFixed(1)

/** Đường cong mượt Catmull-Rom → Bézier bậc 3 qua các điểm. */
export function smoothPath(p: [number, number][]): string {
  if (p.length === 0) return ''
  let d = `M${p[0][0]},${p[0][1]}`
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[i + 2] ?? p2
    // Kẹp y của điểm điều khiển trong khoảng y hai đầu đoạn để đường không lõm xuống dưới trục / vọt quá đỉnh.
    const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1])
    const clampY = (v: number) => Math.min(Math.max(v, lo), hi)
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, clampY(p1[1] + (p2[1] - p0[1]) / 6)]
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, clampY(p2[1] - (p3[1] - p1[1]) / 6)]
    d += ` C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p2[0])},${f1(p2[1])}`
  }
  return d
}

/** Độ dài + offset từng lát donut (stroke-dasharray). `gap` là khe hở giữa các lát. Tổng 0 → []. */
export function donutArcs(values: number[], circumference: number, gap = 0): { length: number; offset: number }[] {
  const total = values.reduce((a, b) => a + Math.max(b, 0), 0)
  if (total <= 0) return []
  let acc = 0
  return values.map((v) => {
    const len = (Math.max(v, 0) / total) * circumference
    const arc = { length: Math.max(len - gap, 0), offset: acc === 0 ? 0 : -acc }
    acc += len
    return arc
  })
}
