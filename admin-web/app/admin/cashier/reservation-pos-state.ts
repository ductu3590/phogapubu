export type ReservationTablePick = {
  reservationId: string
  tableIds: Set<string>
}

export type ReservationPosState = {
  selectedSessionId: string | null
  pickedSessionIds: Set<string>
  pickedTableIds: Set<string>
  reservationPick: ReservationTablePick | null
}

export function beginReservationTablePick(
  state: ReservationPosState,
  reservation: { reservationId: string; tableIds: string[] },
): ReservationPosState {
  return {
    ...state,
    reservationPick: { reservationId: reservation.reservationId, tableIds: new Set(reservation.tableIds) },
  }
}

export function toggleReservationTable(state: ReservationPosState, tableId: string): ReservationPosState {
  if (!state.reservationPick) return state
  const tableIds = new Set(state.reservationPick.tableIds)
  if (tableIds.has(tableId)) tableIds.delete(tableId)
  else tableIds.add(tableId)
  return { ...state, reservationPick: { ...state.reservationPick, tableIds } }
}

export function cancelReservationTablePick(state: ReservationPosState): ReservationPosState {
  return { ...state, reservationPick: null }
}

export function selectArrivedReservationSession(
  state: ReservationPosState,
  sessionId: string,
): ReservationPosState {
  return {
    ...state,
    selectedSessionId: sessionId,
    pickedSessionIds: new Set(),
    pickedTableIds: new Set(),
    reservationPick: null,
  }
}
