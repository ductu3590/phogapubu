import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CreateOrderRequest, Order, ServiceRequest } from "@/types/order.types";
import { orderService, sessionOrderService } from "./order.api";
import {
  CREATE_ORDER_KEY,
  CONFIRM_RECEIVED_KEY,
  GET_TAKEAWAY_ORDERS_KEY,
  GET_ORDER_BY_ID_KEY,
} from "@/constants/api";

export function useCreateOrder() {
  return useMutation<Order, Error, CreateOrderRequest>({
    mutationKey: [CREATE_ORDER_KEY],
    mutationFn: (req) => orderService.createOrder(req),
  });
}

export function useCancelOrder() {
  return useMutation<void, Error, { orderId: string; token: string }>({
    mutationFn: ({ orderId, token }) => orderService.cancelOrder(orderId, token),
  });
}

export function useCallStaff() {
  return useMutation<void, Error, ServiceRequest>({
    mutationFn: (req) => sessionOrderService.callStaff(req),
  });
}

export function useConfirmReceived() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { orderId: string; zaloUserId: string }>({
    mutationKey: [CONFIRM_RECEIVED_KEY],
    mutationFn: ({ orderId, zaloUserId }) =>
      orderService.confirmReceived(orderId, zaloUserId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [GET_TAKEAWAY_ORDERS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [GET_ORDER_BY_ID_KEY] });
    },
  });
}
