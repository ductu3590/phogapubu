// Server Component — đọc params rồi truyền vào Client Component
import KitchenDisplay from './kitchen-display'

export default async function KitchenPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>
}) {
  const { storeSlug } = await params
  return <KitchenDisplay storeSlug={storeSlug} />
}
