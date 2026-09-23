import { useQuery } from "@tanstack/react-query";
import { getBooking, getReservationConfig, getReservationSlots } from "./reservation.api";
import type { ReservationAccess } from "@/types/reservation.types";

export const reservationKeys = {
  config: (storeId: string) => ["reservation-config", storeId] as const,
  slots: (storeId: string, localDate: string) => ["reservation-slots", storeId, localDate] as const,
  // Token tuyệt đối không nằm trong query key/cache devtools. generation đổi khi access đổi.
  booking: (storeId: string, reservationId: string, generation: string) =>
    ["reservation-booking", storeId, reservationId, generation] as const,
};

export function useReservationConfig(storeId: string) {
  return useQuery({ queryKey: reservationKeys.config(storeId), queryFn: () => getReservationConfig(storeId), enabled: !!storeId });
}

export function useReservationSlots(storeId: string, localDate: string, enabled = true) {
  return useQuery({ queryKey: reservationKeys.slots(storeId, localDate), queryFn: () => getReservationSlots(storeId, localDate), enabled: enabled && !!storeId && !!localDate });
}

export function useCustomerReservation(access: ReservationAccess | null, accessGeneration: string, enabled = true) {
  return useQuery({
    queryKey: reservationKeys.booking(access?.storeId ?? "", access?.reservationId ?? "", accessGeneration),
    queryFn: () => getBooking(access as ReservationAccess),
    enabled: enabled && !!access?.storeId && !!access?.reservationId && !!access?.token,
    refetchInterval: () => typeof document === "undefined" || document.visibilityState === "visible" ? 5_000 : false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
  });
}
