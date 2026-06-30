// Tính tiền cho ORDER item (đọc từ OrderItem có selectedToppings).
// item_price KHÔNG gồm topping → mọi nơi hiển thị tiền dòng phải dùng helper này.
type PriceableOrderItem = {
  price: number;
  quantity: number;
  selectedToppings?: { price: number }[];
};

export const getItemUnitPrice = (i: PriceableOrderItem): number =>
  i.price + (i.selectedToppings ?? []).reduce((s, t) => s + t.price, 0);

export const getItemLineTotal = (i: PriceableOrderItem): number =>
  getItemUnitPrice(i) * i.quantity;
