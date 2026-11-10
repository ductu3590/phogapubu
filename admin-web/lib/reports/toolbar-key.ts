import type { ReportPreset } from '@/lib/reports/period'

/**
 * Key cho <ReportToolbar>: đổi kỳ trong HỘP THOẠI dùng router.replace — component không bị gỡ nên ô ngày nháp
 * (state copy từ props một lần) sẽ giữ ngày cũ. Gắn key theo kỳ để kỳ mới là toolbar mới.
 * Nằm ở module thường (không 'use client') vì reports-screen.tsx là server component gọi hàm này.
 */
export const toolbarKey = (r: { preset: ReportPreset; from: string; to: string }): string => `${r.preset}|${r.from}|${r.to}`
