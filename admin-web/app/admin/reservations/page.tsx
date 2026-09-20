import { redirect } from 'next/navigation'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { listReservationQueue } from '@/lib/actions/reservations'
import { loadFloorLayout } from '@/lib/actions/floor-layout'
import { listOpenTableSessions } from '@/lib/actions/table-session'
import { createClient } from '@/lib/supabase/server'
import ReservationsClient from './reservations-client'

function queueRange() {
  const now = Date.now()
  return {
    recentSince: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    futureUntil: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

// Hàng đợi đặt bàn chỉ dành cho chủ quán. Kiểm capability lại ở route để URL trực tiếp
// không mở chức năng cho quán chưa chọn mô hình reservation.
export default async function ReservationsPage() {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')

  const supabase = await createClient()
  const [workflowResult, queueResult, floorResult, sessionsResult] = await Promise.all([
    supabase.rpc('get_public_store_workflow', { p_store_id: operator.storeId }),
    listReservationQueue(queueRange()),
    loadFloorLayout(),
    listOpenTableSessions(),
  ])
  const reservationsEnabled = (workflowResult.data as { reservations_enabled?: unknown } | null)
    ?.reservations_enabled === true
  if (!reservationsEnabled) redirect('/admin/dashboard')

  return (
    <ReservationsClient
      storeId={operator.storeId}
      initialReservations={queueResult.ok ? queueResult.reservations : []}
      initialError={queueResult.ok ? null : queueResult.error}
      initialFloor={floorResult.ok ? floorResult.snapshot : null}
      initialFloorError={floorResult.ok ? null : floorResult.error}
      initialSessions={sessionsResult.ok ? sessionsResult.sessions : []}
      initialSessionsError={sessionsResult.ok ? null : sessionsResult.error}
    />
  )
}
