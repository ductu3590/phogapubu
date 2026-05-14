import { useMutation } from "@tanstack/react-query";
import { CreateOrderRequest, Order } from "@/types/order.types";
import { orderService } from "./order.api";
import { CREATE_ORDER_KEY } from "@/constants/api";

export function useCreateOrder() {
  return useMutation<Order, Error, CreateOrderRequest>({
    mutationKey: [CREATE_ORDER_KEY],
    mutationFn: (req) => orderService.createOrder(req),
  });
}

export function useCancelOrder() {
  return useMutation<void, Error, string>({
    mutationFn: (orderId) => orderService.cancelOrder(orderId),
  });
}
