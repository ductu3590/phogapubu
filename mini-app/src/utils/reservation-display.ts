import type { CustomerReservation } from "@/types/reservation.types";

export function formatReservationTime(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatReservationDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function reservationActions(booking: CustomerReservation, _now = new Date()) {
  if (booking.status === "pending") {
    return {
      message: "Quán chưa xác nhận — đặt bàn chưa được bảo đảm",
      canRequestChange: booking.canRequestChange,
      canCancel: booking.canCancel,
      canPreorder: false,
    };
  }
  if (booking.status === "confirmed") {
    return {
      message: booking.customerMessage || "Quán đã xác nhận đặt bàn của bạn.",
      canRequestChange: booking.canRequestChange,
      canCancel: booking.canCancel,
      canPreorder: booking.canPreorder,
    };
  }
  return {
    message: booking.customerMessage || "Đặt bàn đã kết thúc.",
    canRequestChange: false,
    canCancel: false,
    canPreorder: false,
  };
}

// Nhãn + tông trạng thái đặt bàn (dời từ components/reservations/reservation-status.tsx để test).
const RESERVATION_STATUS: Record<string, { label: string; tone: "success" | "info" | "warning" | "critical" | "neutral" }> = {
  pending: { label: "Chờ quán xác nhận", tone: "warning" },
  confirmed: { label: "Đã xác nhận", tone: "success" },
  rejected: { label: "Quán chưa nhận", tone: "critical" },
  cancelled_by_customer: { label: "Đã huỷ", tone: "neutral" },
  cancelled_by_store: { label: "Quán đã huỷ", tone: "critical" },
  arrived: { label: "Bạn đã đến quán", tone: "info" },
  no_show: { label: "Không đến", tone: "neutral" },
  completed: { label: "Đã hoàn tất", tone: "neutral" },
};

export function reservationTone(status: string): { label: string; tone: "success" | "info" | "warning" | "critical" | "neutral" } {
  return RESERVATION_STATUS[status] ?? { label: status, tone: "neutral" };
}
