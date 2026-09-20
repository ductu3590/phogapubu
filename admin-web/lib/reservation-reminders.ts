import type { ReservationRow } from './actions/reservations'
import { dueReservationReminders } from './reservation-queue'

const BUCKET_MS = 5 * 60_000

export type ReminderStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export type ReservationReminderSnapshot = {
  reservationIds: string[]
  count: number
}

export function createReservationReminderCoordinator({
  storeId,
  storage,
  now,
  playBell,
}: {
  storeId: string
  storage?: ReminderStorage
  now: () => number
  playBell: () => void
}) {
  const memory = new Set<string>()

  const due = (reservations: ReservationRow[]): ReservationReminderSnapshot => {
    const rows = dueReservationReminders(reservations, new Date(now()))
    return { reservationIds: rows.map((row) => row.reservationId), count: rows.length }
  }

  const hasPlayed = (key: string): boolean => {
    if (memory.has(key)) return true
    try {
      if (storage?.getItem(key) === '1') {
        memory.add(key)
        return true
      }
    } catch {
      // Privacy mode hoặc storage bị chặn không được làm crash hàng đợi đặt bàn.
    }
    return false
  }

  const markPlayed = (key: string) => {
    memory.add(key)
    try {
      storage?.setItem(key, '1')
    } catch {
      // Bản ghi trong memory vẫn đủ để không kêu lặp trong tab hiện tại.
    }
  }

  return {
    due,
    sync(reservations: ReservationRow[], audioUnlocked: boolean): ReservationReminderSnapshot {
      const snapshot = due(reservations)
      if (!audioUnlocked || snapshot.count === 0) return snapshot

      const bucket = Math.floor(now() / BUCKET_MS)
      const key = `mevo:reservation-reminder:${storeId}:${bucket}`
      if (hasPlayed(key)) return snapshot
      markPlayed(key)
      playBell()
      return snapshot
    },
  }
}
