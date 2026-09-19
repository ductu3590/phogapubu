'use client'

import { useCallback, useEffect, useState } from 'react'
import { listReservationQueue, type ReservationRow } from '@/lib/actions/reservations'
import { reservationQueueState, sortReservationQueue } from '@/lib/reservation-queue'
import { watchReservationQueue } from '@/lib/reservation-queue-watcher'
import { createClient } from '@/lib/supabase/client'
import ReservationCard from './reservation-card'
import {
  filterReservationsForDate,
  groupReservationsForDisplay,
  reservationLocalDate,
} from './reservation-ui'

function queueRange() {
  const now = Date.now()
  return {
    recentSince: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    futureUntil: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

export default function ReservationsClient({
  storeId,
  initialReservations,
  initialError,
}: {
  storeId: string
  initialReservations: ReservationRow[]
  initialError: string | null
}) {
  const [reservations, setReservations] = useState(initialReservations)
  const [error, setError] = useState(initialError)
  const [connected, setConnected] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => reservationLocalDate(new Date().toISOString()) ?? '')

  const load = useCallback(
    () => listReservationQueue(queueRange()),
    [],
  )

  useEffect(() => {
    const watcher = watchReservationQueue({
      client: createClient(),
      storeId,
      load,
      onRows: setReservations,
      onError: setError,
      onConnected: setConnected,
    })
    return () => watcher.dispose()
  }, [load, storeId])

  const now = new Date()
  const filtered = filterReservationsForDate(reservations, selectedDate, now)
  const groups = groupReservationsForDisplay(sortReservationQueue(filtered, now), now)
  const pendingCount = reservations.filter((reservation) => {
    const kind = reservationQueueState(reservation, now).kind
    return kind === 'pending' || kind === 'change_requested'
  }).length
  const overdueCount = reservations.filter(
    (reservation) => reservationQueueState(reservation, now).kind === 'overdue',
  ).length

  const reloadNow = async () => {
    const result = await load()
    if (result.ok) {
      setReservations(result.reservations)
      setError(null)
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">📅 Đặt bàn</h1>
              <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`} />
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {connected ? 'Đang cập nhật trực tiếp' : 'Đang kết nối — vẫn tự tải lại mỗi vài giây'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void reloadNow()}
            className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            ↻ Tải lại
          </button>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cần duyệt / đổi</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{pendingCount}</p>
          </div>
          <div className="rounded-xl bg-red-50 p-3 shadow-sm ring-1 ring-red-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Quá giờ chưa đến</p>
            <p className="mt-1 text-2xl font-bold text-red-800">{overdueCount}</p>
          </div>
        </div>

        <label className="mb-5 block rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Lọc lịch đã xử lý / sắp tới</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900"
          />
          <span className="mt-1 block text-xs text-gray-500">Việc chờ duyệt, khách yêu cầu đổi, quá giờ và đã đến luôn được giữ lại.</span>
        </label>

        {error && (
          <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            {error}
          </div>
        )}

        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-12 text-center text-sm text-gray-500">
            Chưa có đặt bàn cần theo dõi trong khoảng thời gian này.
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.title} aria-label={group.title}>
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-700">
                  {group.title} <span className="text-gray-400">({group.reservations.length})</span>
                </h2>
                <div className="space-y-3">
                  {group.reservations.map((reservation) => (
                    <ReservationCard key={reservation.reservationId} reservation={reservation} now={now} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
