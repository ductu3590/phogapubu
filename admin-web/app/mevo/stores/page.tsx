import { ChevronRight, Plus, Store } from 'lucide-react'
import Link from 'next/link'
import { loadMevoOverview, type MevoStoreCard } from '@/lib/mevo-overview'
import { StatusPill, storeInitials, storeStatus, workflowSummary } from '../store-card'

// Danh sách quán theo bản Stitch A11: bảng có ô chữ viết tắt, slug, trạng thái, mô hình vận hành.
export default async function MevoStoresPage() {
  const { stores, totals } = await loadMevoOverview()

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-6">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white" aria-hidden>
              <Store className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900">Danh sách quán</h1>
              <p className="text-[13px] text-slate-500">{totals.stores} quán · {totals.onboarding} đang onboarding · {totals.published} đã publish Mini App</p>
            </div>
          </div>
          <Link href="/mevo/stores/new" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand/90">
            <Plus className="size-4" aria-hidden />Thêm quán mới
          </Link>
        </header>

        {stores.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
            Chưa có quán nào. Bấm Thêm quán mới để bắt đầu.
          </div>
        ) : (
          <>
            {/* Từ md: bảng đủ cột */}
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
              <table className="w-full text-sm">
                <thead className="bg-slate-100/70 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Tên quán</th>
                    <th className="px-4 py-3">Slug · Mini App ID</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3">Mô hình vận hành</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stores.map((store) => (
                    <tr key={store.id} className="hover:bg-orange-50/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Initials store={store} />
                          <div className="min-w-0 max-w-72">
                            <Link href={`/mevo/stores/${store.id}`} className="inline-flex items-center gap-0.5 font-semibold text-slate-900 underline-offset-4 hover:text-brand hover:underline">
                              {store.name}<ChevronRight className="size-4 text-slate-400" aria-hidden />
                            </Link>
                            <p className="truncate text-[13px] text-slate-500">{store.tableCount} bàn · {store.address || 'Chưa nhập địa chỉ'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[13px] text-slate-700">{store.slug}</span>
                        <p className="mt-1 font-mono text-xs text-slate-500">{store.miniAppId ?? 'Chưa có Mini App ID'}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><StatusPill {...storeStatus(store)} /></td>
                      <td className="min-w-56 px-4 py-3 text-[13px] text-slate-700">{workflowSummary(store)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Điện thoại: mỗi quán một dòng bấm được */}
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white md:hidden">
              {stores.map((store) => (
                <li key={store.id}>
                  <Link href={`/mevo/stores/${store.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                    <Initials store={store} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-semibold text-slate-900">{store.name}</p>
                      <p className="truncate text-[13px] text-slate-500">{workflowSummary(store)}</p>
                      <StatusPill {...storeStatus(store)} />
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-slate-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function Initials({ store }: { store: MevoStoreCard }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-orange-100 text-sm font-bold text-brand" aria-hidden>
      {storeInitials(store.name)}
    </span>
  )
}
