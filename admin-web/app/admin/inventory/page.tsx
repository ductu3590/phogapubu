import InventoryScreen from './inventory-screen'

// Trang đầy đủ (mở thẳng URL / F5). Bấm từ POS thì ra bản hộp thoại ở @modal/(config)/(.)inventory.
export default function InventoryPage() {
  return <InventoryScreen inModal={false} />
}
