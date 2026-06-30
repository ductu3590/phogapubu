'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  toggleMenuItem,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  addCategory,
  updateCategory,
  deleteCategory,
  addTopping,
  updateTopping,
  deleteTopping,
} from '@/lib/actions/menu'
import { formatVND } from '@/lib/utils'
import SquareCropper from './square-cropper'

type Topping = {
  id: string
  name: string
  price: number
  is_available: boolean
  sort_order: number
}
type MenuItem = {
  id: string
  name: string
  description: string | null
  price: number
  is_available: boolean
  image_url: string | null
  sort_order: number
  category_id: string
  menu_item_toppings?: Topping[]
}
type Category = { id: string; name: string; sort_order: number; menu_items: MenuItem[] }

export default function MenuClient({ categories, storeId }: { categories: Category[]; storeId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddCat, setShowAddCat] = useState(false)
  const [editItem, setEditItem] = useState<MenuItem | null>(null)
  const [editCat, setEditCat] = useState<Category | null>(null)
  const [selectedCatId, setSelectedCatId] = useState(categories[0]?.id ?? '')
  // File ảnh đã crop chờ submit (add + edit dùng riêng)
  const [addImage, setAddImage] = useState<File | null>(null)
  const [editImage, setEditImage] = useState<File | null>(null)
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

  const handleDeleteCat = (cat: Category) => {
    if (!confirm(`Xoá danh mục "${cat.name}"?`)) return
    startTransition(async () => {
      try {
        await deleteCategory(cat.id)
        setEditCat(null)
        router.refresh()
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Không xoá được danh mục')
      }
    })
  }

  const selectedCat = categories.find((c) => c.id === selectedCatId)

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Category tabs bên trái */}
      <aside className="w-52 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 py-3">
        {categories.map((cat) => (
          <div key={cat.id} className="group flex items-center">
            <button
              onClick={() => setSelectedCatId(cat.id)}
              className={`flex-1 px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                selectedCatId === cat.id ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {cat.name}
              <span className="ml-1 text-xs text-gray-400">({cat.menu_items?.length ?? 0})</span>
            </button>
            <button
              onClick={() => setEditCat(cat)}
              className="mr-1 px-1.5 py-1 text-gray-300 opacity-0 transition-opacity hover:text-gray-600 group-hover:opacity-100"
              title="Sửa danh mục"
            >
              ✎
            </button>
          </div>
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
          <p className="font-semibold text-gray-700">{selectedCat?.name}</p>
          <button
            onClick={() => {
              setAddImage(null)
              setShowAddItem(true)
            }}
            className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            + Thêm món
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {selectedCat?.menu_items
              ?.slice()
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((item) => {
                const isAvailable = overrides[item.id] !== undefined ? overrides[item.id] : item.is_available
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3"
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
                      <span
                        className={`absolute top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                          isAvailable ? 'left-[22px]' : 'left-[2px]'
                        }`}
                      />
                    </button>

                    {/* Thumbnail ảnh món (vuông 1:1) */}
                    <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg">🍽️</div>
                      )}
                    </div>

                    {/* Tên + giá */}
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-medium ${isAvailable ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                        {item.name}
                      </p>
                      {item.description && <p className="truncate text-xs text-gray-400">{item.description}</p>}
                      {(item.menu_item_toppings?.length ?? 0) > 0 && (
                        <span className="mt-0.5 inline-block rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-600">
                          {item.menu_item_toppings!.length} topping
                        </span>
                      )}
                    </div>
                    <p className="flex-shrink-0 font-semibold text-gray-700">{formatVND(item.price)}</p>

                    {/* Sửa */}
                    <button
                      onClick={() => {
                        setEditImage(null)
                        setEditItem(item)
                      }}
                      disabled={isPending}
                      className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                      title="Sửa món"
                    >
                      ✎
                    </button>
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
          <ItemForm
            categories={categories}
            defaultCategoryId={selectedCatId}
            onImage={setAddImage}
            submitLabel="Thêm"
            onSubmit={async (fd) => {
              if (addImage) fd.set('image', addImage)
              const newId = await addMenuItem(fd)
              setShowAddItem(false)
              setAddImage(null)
              router.refresh()
              // Mở ngay modal sửa để thêm topping cho món vừa tạo.
              setEditItem({
                id: newId,
                name: fd.get('name') as string,
                description: (fd.get('description') as string) || null,
                price: parseInt(fd.get('price') as string, 10),
                is_available: true,
                image_url: null,
                sort_order: 0,
                category_id: fd.get('category_id') as string,
                menu_item_toppings: [],
              })
            }}
            onCancel={() => setShowAddItem(false)}
          />
        </Modal>
      )}

      {/* Modal sửa món */}
      {editItem && (
        <Modal title="Sửa món" onClose={() => setEditItem(null)}>
          <ItemForm
            categories={categories}
            item={editItem}
            defaultCategoryId={editItem.category_id}
            onImage={setEditImage}
            submitLabel="Lưu"
            onSubmit={async (fd) => {
              if (editImage) fd.set('image', editImage)
              await updateMenuItem(editItem.id, fd)
              setEditItem(null)
              setEditImage(null)
              router.refresh()
            }}
            onCancel={() => setEditItem(null)}
          />
          <ToppingEditor item={editItem} router={router} />
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

      {/* Modal sửa / xoá danh mục */}
      {editCat && (
        <Modal title="Sửa danh mục" onClose={() => setEditCat(null)}>
          <form
            action={async (fd) => {
              await updateCategory(editCat.id, fd)
              setEditCat(null)
              router.refresh()
            }}
            className="flex flex-col gap-3"
          >
            <div>
              <label className="label">Tên danh mục *</label>
              <input name="name" required defaultValue={editCat.name} className="input" />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleDeleteCat(editCat)}
                disabled={isPending}
                className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-40"
              >
                🗑️ Xoá
              </button>
              <button type="button" onClick={() => setEditCat(null)} className="flex-1 rounded-xl border py-2.5 text-sm font-medium text-gray-600">Huỷ</button>
              <button type="submit" className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">Lưu</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// Form thêm/sửa món dùng chung (có cropper ảnh 1:1)
function ItemForm({
  categories,
  item,
  defaultCategoryId,
  onImage,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  categories: Category[]
  item?: MenuItem
  defaultCategoryId: string
  onImage: (f: File | null) => void
  onSubmit: (fd: FormData) => Promise<void>
  onCancel: () => void
  submitLabel: string
}) {
  return (
    <form action={onSubmit} className="flex flex-col gap-3">
      <div>
        <label className="label">Danh mục</label>
        <select name="category_id" required defaultValue={defaultCategoryId} className="input">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Tên món *</label>
        <input name="name" required defaultValue={item?.name} placeholder="VD: Phở gà đặc biệt" className="input" />
      </div>
      <div>
        <label className="label">Mô tả</label>
        <input name="description" defaultValue={item?.description ?? ''} placeholder="Mô tả ngắn (tuỳ chọn)" className="input" />
      </div>
      <div>
        <label className="label">Giá (VNĐ) *</label>
        <input name="price" type="number" required min="0" defaultValue={item?.price} placeholder="80000" className="input" />
      </div>
      <div>
        <label className="label">Ảnh món (1:1)</label>
        <SquareCropper initialUrl={item?.image_url ?? null} onChange={onImage} />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border py-2.5 text-sm font-medium text-gray-600">Huỷ</button>
        <button type="submit" className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">{submitLabel}</button>
      </div>
    </form>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      {/* text-gray-900 + bg-white explicit để tránh inherit dark mode từ body */}
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 text-gray-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ToppingEditor({
  item,
  router,
}: {
  item: MenuItem
  router: ReturnType<typeof useRouter>
}) {
  const [isPending, startTransition] = useTransition()
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const toppings = item.menu_item_toppings ?? []

  const handleAdd = () => {
    const name = newName.trim()
    const price = parseInt(newPrice, 10)
    if (!name || Number.isNaN(price) || price < 0) {
      alert('Nhập tên và giá topping hợp lệ')
      return
    }
    startTransition(async () => {
      await addTopping(item.id, name, price)
      setNewName('')
      setNewPrice('')
      router.refresh()
    })
  }

  const handleToggle = (t: Topping) => {
    startTransition(async () => {
      await updateTopping(t.id, { is_available: !t.is_available })
      router.refresh()
    })
  }

  const handleDelete = (t: Topping) => {
    if (!confirm(`Xoá topping "${t.name}"?`)) return
    startTransition(async () => {
      await deleteTopping(t.id)
      router.refresh()
    })
  }

  return (
    <div className="mt-2 border-t border-gray-100 pt-3">
      <p className="mb-2 text-sm font-semibold text-gray-700">Topping (tuỳ chọn)</p>
      <div className="flex flex-col gap-2">
        {toppings.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5">
            <button
              type="button"
              onClick={() => handleToggle(t)}
              disabled={isPending}
              className={`h-5 w-9 flex-shrink-0 rounded-full transition-colors ${t.is_available ? 'bg-green-500' : 'bg-gray-300'}`}
              title={t.is_available ? 'Đang bán — bấm để tạm hết' : 'Tạm hết — bấm để bán lại'}
            >
              <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${t.is_available ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className={`flex-1 text-sm ${t.is_available ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{t.name}</span>
            <span className="text-sm text-gray-500">{formatVND(t.price)}</span>
            <button
              type="button"
              onClick={() => handleDelete(t)}
              disabled={isPending}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
              title="Xoá topping"
            >🗑️</button>
          </div>
        ))}
        {toppings.length === 0 && <p className="text-xs text-gray-400">Chưa có topping</p>}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Tên topping (VD: Thêm trứng)"
          className="input flex-1"
        />
        <input
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
          type="number"
          min="0"
          placeholder="Giá"
          className="input w-24"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending}
          className="flex-shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
        >+ Thêm</button>
      </div>
    </div>
  )
}
