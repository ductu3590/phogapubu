import InventoryScreen from '../../../inventory/inventory-screen'

// Bấm link trong ứng dụng → "Kho" hiện trong hộp thoại cấu hình (vỏ ở ../layout.tsx).
export default function Intercepted() {
  return <InventoryScreen inModal />
}
