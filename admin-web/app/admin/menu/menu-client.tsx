'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleMenuItem, addMenuItem, addCategory, deleteMenuItem } from '@/lib/actions/menu'
import { formatVND } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Category = { id: string; name: string; sort_order: number; menu_items: any[] }

export default function MenuClient({ categories, storeId }: { categories: Category[]; storeId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddCat, setShowAddCat] = useState(false)
  const [selectedCatId, setSelectedCatId] = useState(categories[0]?.id ?? '')
  // Optimistic state cho từng món (is_available)
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

  const handleToggle = (itemId: string, current: boolean) => {
    setOverrides((prev) => ({ ...prev, [itemId]: !current }))
    startTransition(async () => {
      await toggleMenuItem(itemId, !current)
      router.refresh()
    })
  }

  const handleDeleteItem = (itemId: string, name: string) => {
    if (!confirm(`Xoá món "${name}"?`)) return
    startTransition(async () => {
      await deleteMenuItem(itemId)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Category tabs bên trái */}
      <aside className="w-48 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 py-3">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCatId(cat.id)}
            className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-colors ${
              selectedCatId === cat.id
                ? 'bg-orange-50 text-orange-600'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {cat.name}
            <span className="ml-1 text-xs text-gray-400">
              ({cat.menu_items?.length ?? 0})
            </span>
          </button>
        ))}
        <button
          onClick={() => setShowAddCat(true)}
          className="mt-2 w-full px-4 py-2 text-left text-sm text-orange-500 hover:bg-orange-50"
        >
          + Thêm danh mục
        </button>
      </aside>

      {/* Danh sách món bên phải */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <p className="font-semibold text-gray-700">
            {categories.find((c) => c.id === selectedCatId)?.name}
          </p>
          <button
            onClick={() => setShowAddItem(true)}
            className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            + Thêm món
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {categories
              .find((c) => c.id === selectedCatId)
              ?.menu_items?.sort((a: {sort_order: number}, b: {sort_order: number}) => a.sort_order - b.sort_order)
              .map((item: {id: string; name: string; description: string; price: number; is_available: boolean}) => {
                // Dùng optimistic override nếu có, không thì dùng giá trị từ DB
                const isAvailable = overrides[item.id] !== undefined ? overrides[item.id] : item.is_available
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3"
                  >
                    {/* Toggle on/off */}
                    <button
                      onClick={() => handleToggle(item.id, isAvailable)}
                      disabled={isPending}
                      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 ${
                        isAvailable ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                      title={isAvailable ? 'Đang bán — bấm để ẩn' : 'Tạm hết — bấm để bán lại'}
                    >
                      {/* Circle: top=2px, diameter=20px, pill=44px → on: left=22px (44-20-2=22) */}
                      <span
                        className={`absolute top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                          isAvailable ? 'left-[22px]' : 'left-[2px]'
                        }`}
                      />
                    </button>

                    {/* Tên + giá */}
                    <div className="flex-1 min-w-0">
                      <p className={`truncate font-medium ${isAvailable ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                        {item.name}
                      </p>
                      {item.description && (
                        <p className="truncate text-xs text-gray-400">{item.description}</p>
                      )}
                    </div>
                    <p className="flex-shrink-0 font-semibold text-gray-700">{formatVND(item.price)}</p>

                    {/* Xoá */}
                    <button
                      onClick={() => handleDeleteItem(item.id, item.name)}
                      disabled={isPending}
                      className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                      title="Xoá món"
                    >
                      🗑️
                    </button>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      {/* Modal thêm món */}
      {showAddItem && (
        <Modal title="Thêm món mới" onClose={() => setShowAddItem(false)}>
          <form
            action={async (fd) => {
              fd.append('store_id', storeId)
              await addMenuItem(fd)
              setShowAddItem(false)
              router.refresh()
            }}
            className="flex flex-col gap-3"
          >
            <div>
              <label className="label">Danh mục</label>
              <select name="category_id" required className="input">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Tên món *</label>
              <input name="name" required placeholder="VD: Phở gà đặc biệt" className="input" />
            </div>
            <div>
              <label className="label">Mô tả</label>
              <input name="description" placeholder="Mô tả ngắn (tuỳ chọn)" className="input" />
            </div>
            <div>
              <label className="label">Giá (VNĐ) *</label>
              <input name="price" type="number" required min="0" placeholder="80000" className="input" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowAddItem(false)} className="flex-1 rounded-xl border py-2.5 text-sm font-medium text-gray-600">Huỷ</button>
              <button type="submit" className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">Thêm</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal thêm danh mục */}
      {showAddCat && (
        <Modal title="Thêm danh mục" onClose={() => setShowAddCat(false)}>
          <form
            action={async (fd) => {
              await addCategory(fd)
              setShowAddCat(false)
              router.refresh()
            }}
            className="flex flex-col gap-3"
          >
            <div>
              <label className="label">Tên danh mục *</label>
              <input name="name" required placeholder="VD: Đồ uống, Tráng miệng..." className="input" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowAddCat(false)} className="flex-1 rounded-xl border py-2.5 text-sm font-medium text-gray-600">Huỷ</button>
              <button type="submit" className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">Thêm</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      {/* text-gray-900 + bg-white explicit để tránh inherit dark mode từ body */}
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl text-gray-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
