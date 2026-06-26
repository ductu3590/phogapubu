import { useMutation } from "@tanstack/react-query";
import { CreateOrderRequest, Order, ServiceRequest } from "@/types/order.types";
import { orderService, sessionOrderService } from "./order.api";
import { CREATE_ORDER_KEY } from "@/constants/api";

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
