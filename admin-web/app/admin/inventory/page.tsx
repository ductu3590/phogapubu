import InventoryScreen from './inventory-screen'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Trang đầy đủ (mở thẳng URL / F5). Bấm từ POS thì ra bản hộp thoại ở @modal/(config)/(.)inventory.
// /admin/inventory?doc=<id> mở sẵn chi tiết phiếu nhập đó (Công nợ NCC dẫn sang).
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const sp = await searchParams
  const doc = typeof sp.doc === 'string' && UUID.test(sp.doc) ? sp.doc : null
  return <InventoryScreen inModal={false} initialDocId={doc} />
}
