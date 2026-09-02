'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { GripVertical } from 'lucide-react'
import {
  toggleMenuItem,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  addCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  reorderMenuItems,
  addPoolTopping,
  updatePoolTopping,
  deletePoolTopping,
  setMenuItemToppings,
  addItemVariant,
  updateItemVariant,
  deleteItemVariant,
  reorderItemVariants,
  setVariantGroupName,
} from '@/lib/actions/menu'
import { parseVariantInput, displayPriceLabel } from '@/lib/menu/variant'
import { formatVND } from '@/lib/utils'
import { formatVndTyping, parseVnd } from '@/lib/money'
import SquareCropper from './square-cropper'

// Topping trong kho dùng chung của quán
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
  // Danh sách link tới topping trong kho (chỉ chứa topping_id)
  menu_item_toppings?: { topping_id: string }[]
  // Tên nhóm lựa chọn hiện trên mini-app (VD: "Chọn cỡ"); null = dùng nhãn mặc định
  variant_group_name?: string | null
  // Lựa chọn quyết định giá — giá TUYỆT ĐỐI, thay giá món (khác topping: cộng thêm)
  menu_item_variants?: { id: string; name: string; price: number; is_available: boolean; sort_order: number }[]
}
type Category = { id: string; name: string; sort_order: number; menu_items: MenuItem[] }

function moveArrayItem<T>(items: T[], oldIndex: number, newIndex: number): T[] {
  const next = [...items]
  const [moved] = next.splice(oldIndex, 1)
  next.splice(newIndex, 0, moved)
  return next
}

export default function MenuClient({ categories: initialCategories, toppings }: { categories: Category[]; toppings: Topping[]; storeId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddCat, setShowAddCat] = useState(false)
  const [editItem, setEditItem] = useState<MenuItem | null>(null)
  const [editCat, setEditCat] = useState<Category | null>(null)
  const [selectedCatId, setSelectedCatId] = useState(initialCategories[0]?.id ?? '')
  // File ảnh đã crop chờ submit (add + edit dùng riêng)
  const [addImage, setAddImage] = useState<File | null>(null)
  const [editImage, setEditImage] = useState<File | null>(null)
  // Optimistic state cho từng món (is_available)
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)

  // Đồng bộ state local với dữ liệu server mới mỗi khi router.refresh() trả về
  // (state local của drag-sort không tự cập nhật theo prop → badge topping/món bị cũ tới khi F5)
  useEffect(() => {
    setCategories(initialCategories)
  }, [initialCategories])

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

  // `editItem` chỉ là ẢNH CHỤP món lúc bấm ✎: router.refresh() làm mới `categories`
  // chứ KHÔNG làm mới object này. Không tra lại theo id thì thêm/xoá lựa chọn xong
  // danh sách trong modal vẫn y nguyên, và giá món (do trigger DB tính lại) cũng cũ —
  // phải F5 mới thấy. Món vừa tạo chưa kịp vào `categories` thì rơi về ảnh chụp.
  const liveEditItem = editItem
    ? (categories.flatMap((c) => c.menu_items ?? []).find((i) => i.id === editItem.id) ?? editItem)
    : null

  const selectedCat = categories.find((c) => c.id === selectedCatId)
  const selectedItems = selectedCat?.menu_items?.slice().sort((a, b) => a.sort_order - b.sort_order) ?? []

  const handleCategoryDrop = (targetCategoryId: string) => {
    if (!draggedCategoryId || draggedCategoryId === targetCategoryId) return

    const oldIndex = categories.findIndex((cat) => cat.id === draggedCategoryId)
    const newIndex = categories.findIndex((cat) => cat.id === targetCategoryId)
    if (oldIndex === -1 || newIndex === -1) return

    const nextCategories = moveArrayItem(categories, oldIndex, newIndex).map((cat, index) => ({
      ...cat,
      sort_order: index,
    }))
    setDraggedCategoryId(null)
    setCategories(nextCategories)
    startTransition(async () => {
      await reorderCategories(nextCategories.map((cat) => cat.id))
      router.refresh()
    })
  }

  const handleItemDrop = (targetItemId: string) => {
    if (!selectedCat || !draggedItemId || draggedItemId === targetItemId) return

    const oldIndex = selectedItems.findIndex((item) => item.id === draggedItemId)
    const newIndex = selectedItems.findIndex((item) => item.id === targetItemId)
    if (oldIndex === -1 || newIndex === -1) return

    const nextItems = moveArrayItem(selectedItems, oldIndex, newIndex).map((item, index) => ({
      ...item,
      sort_order: index,
    }))
    setDraggedItemId(null)
    setCategories((current) =>
      current.map((cat) => (cat.id === selectedCat.id ? { ...cat, menu_items: nextItems } : cat)),
    )
    startTransition(async () => {
      await reorderMenuItems(selectedCat.id, nextItems.map((item) => item.id))
      router.refresh()
    })
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Category tabs bên trái */}
      <aside className="w-52 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 py-3">
        {categories.map((cat) => (
          <div
            key={cat.id}
            draggable
            onDragStart={() => setDraggedCategoryId(cat.id)}
            onDragEnd={() => setDraggedCategoryId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleCategoryDrop(cat.id)}
            className={`group flex items-center ${draggedCategoryId === cat.id ? 'opacity-60' : ''}`}
          >
            <span className="ml-1 rounded p-1 text-gray-300 group-hover:text-gray-500" title="Kéo để sắp xếp danh mục">
              <GripVertical className="h-4 w-4" />
            </span>
            <button
              onClick={() => setSelectedCatId(cat.id)}
              className={`flex-1 px-2 py-2.5 text-left text-sm font-medium transition-colors ${
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
        <button
          onClick={() => setSelectedCatId('__toppings__')}
          className={`mt-2 w-full px-4 py-2.5 text-left text-sm font-medium ${selectedCatId === '__toppings__' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-100'}`}
        >🧀 Topping <span className="ml-1 text-xs text-gray-400">({toppings.length})</span></button>
      </aside>

      {/* Kho topping dùng chung — khi chọn nút "🧀 Topping" */}
      {selectedCatId === '__toppings__' ? (
        <ToppingPool toppings={toppings} router={router} />
      ) : (
      /* Danh sách món bên phải */
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
            {selectedItems.map((item) => {
                const isAvailable = overrides[item.id] !== undefined ? overrides[item.id] : item.is_available
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setDraggedItemId(item.id)}
                    onDragEnd={() => setDraggedItemId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleItemDrop(item.id)}
                    className={`flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 ${
                      draggedItemId === item.id ? 'opacity-60' : ''
                    }`}
                  >
                    <span className="flex-shrink-0 rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-500" title="Kéo để sắp xếp món">
                      <GripVertical className="h-5 w-5" />
                    </span>
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
                      {(item.menu_item_variants?.length ?? 0) > 0 && (
                        <span className="mt-0.5 ml-1 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-600">
                          {item.menu_item_variants!.length} lựa chọn
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
      )}

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
                // Ô giá hiện số kiểu Việt Nam nên FormData mang chuỗi có dấu chấm —
                // parseInt('15.000', 10) ra 15. Server vừa nhận đơn này nên chắc chắn parse được.
                price: parseVnd(String(fd.get('price') ?? '')) ?? 0,
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
      {liveEditItem && (
        <Modal title="Sửa món" onClose={() => setEditItem(null)}>
          <ItemForm
            categories={categories}
            item={liveEditItem}
            defaultCategoryId={liveEditItem.category_id}
            onImage={setEditImage}
            submitLabel="Lưu"
            onSubmit={async (fd) => {
              if (editImage) fd.set('image', editImage)
              await updateMenuItem(liveEditItem.id, fd)
              setEditItem(null)
              setEditImage(null)
              router.refresh()
            }}
            onCancel={() => setEditItem(null)}
          />
          <ItemToppingPicker item={liveEditItem} toppings={toppings} router={router} />
          <ItemVariantEditor item={liveEditItem} router={router} />
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

// Ô nhập tiền dùng cho form gửi bằng FormData: tự quản lý chuỗi hiển thị, gõ tới đâu
// chèn dấu chấm ngăn nghìn tới đó ("80000" → "80.000").
// type="text" chứ KHÔNG phải "number": input number từ chối hiển thị chuỗi có dấu chấm.
// Mất luôn validate min="0" của trình duyệt, đổi lại server đọc bằng parseVnd — chuỗi
// rỗng hay có chữ đều bị chặn ở đó, không lọt NaN xuống DB.
function MoneyInput({
  initial,
  ...rest
}: { initial?: number | null } & Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'inputMode' | 'defaultValue'
>) {
  const [value, setValue] = useState(initial == null ? '' : formatVndTyping(String(initial)))
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => setValue(formatVndTyping(e.target.value))}
    />
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
  const hasVariants = (item?.menu_item_variants?.length ?? 0) > 0
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
        {/* readOnly chứ KHÔNG disabled: updateMenuItem ghi lại `price` ở MỌI lần lưu (kể cả
            chỉ đổi tên/ảnh). Ô readOnly vẫn submit giá hiện tại → ghi đè đúng số cũ, vô hại;
            ô disabled không submit gì → giá món về rỗng, server từ chối lưu.
            key theo giá: trigger DB tính lại giá món mỗi lần sửa lựa chọn, đổi key ⇒ input
            mount lại và nạp giá mới, không thì ô còn giữ số cũ rồi ghi đè lúc bấm Lưu. */}
        <MoneyInput
          key={item?.price}
          name="price"
          required
          initial={item?.price}
          placeholder="80.000"
          readOnly={hasVariants}
          className={`input ${hasVariants ? 'bg-gray-50 text-gray-500' : ''}`}
        />
        {hasVariants && (
          <p className="mt-1 text-xs text-orange-600">
            {displayPriceLabel(item!.price, true)} — giá đang do tuỳ chọn quyết định.
            Sửa giá ở danh sách lựa chọn bên dưới.
          </p>
        )}
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

// Khu quản lý kho topping dùng chung (panel bên phải khi chọn "🧀 Topping")
function ToppingPool({ toppings, router }: { toppings: Topping[]; router: ReturnType<typeof useRouter> }) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(''); const [price, setPrice] = useState('')
  // State sửa inline 1 topping (tên + giá)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState(''); const [editPrice, setEditPrice] = useState('')
  const add = () => {
    const n = name.trim(); const p = parseVnd(price)
    if (!n || p === null) { alert('Nhập tên và giá topping hợp lệ, ví dụ 10000 hoặc 10.000'); return }
    startTransition(async () => { await addPoolTopping(n, p); setName(''); setPrice(''); router.refresh() })
  }
  const toggle = (t: Topping) => startTransition(async () => { await updatePoolTopping(t.id, { is_available: !t.is_available }); router.refresh() })
  const del = (t: Topping) => { if (!confirm(`Xoá topping "${t.name}"? Sẽ gỡ khỏi mọi món.`)) return
    startTransition(async () => { await deletePoolTopping(t.id); router.refresh() }) }
  const startEdit = (t: Topping) => { setEditId(t.id); setEditName(t.name); setEditPrice(formatVndTyping(String(t.price))) }
  const saveEdit = (t: Topping) => {
    const n = editName.trim(); const p = parseVnd(editPrice)
    if (!n || p === null) { alert('Nhập tên và giá hợp lệ, ví dụ 10000 hoặc 10.000'); return }
    startTransition(async () => { await updatePoolTopping(t.id, { name: n, price: p }); setEditId(null); router.refresh() })
  }
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-3"><p className="font-semibold text-gray-700">🧀 Kho topping</p></div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {toppings.slice().sort((a,b)=>a.sort_order-b.sort_order).map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3">
              {editId === t.id ? (
                <>
                  {/* class riêng, KHÔNG dùng .input (tránh width:100% bóp ô trong flex) */}
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Tên"
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-900" />
                  <input value={editPrice} onChange={(e) => setEditPrice(formatVndTyping(e.target.value))} inputMode="numeric" placeholder="Giá"
                    className="w-24 flex-shrink-0 rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-900" />
                  <button onClick={() => saveEdit(t)} disabled={isPending}
                    className="flex-shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40">Lưu</button>
                  <button onClick={() => setEditId(null)} disabled={isPending}
                    className="flex-shrink-0 rounded-lg border px-3 py-1.5 text-sm text-gray-600">Huỷ</button>
                </>
              ) : (
                <>
                  <button onClick={() => toggle(t)} disabled={isPending}
                    className={`h-6 w-11 flex-shrink-0 rounded-full ${t.is_available ? 'bg-green-500' : 'bg-gray-300'}`}
                    title={t.is_available ? 'Đang bán — bấm để tạm hết' : 'Tạm hết — bấm để bán lại'}>
                    <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${t.is_available ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                  </button>
                  <span className={`min-w-0 flex-1 truncate font-medium ${t.is_available ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{t.name}</span>
                  <span className="flex-shrink-0 font-semibold text-gray-700">{formatVND(t.price)}</span>
                  <button onClick={() => startEdit(t)} disabled={isPending}
                    className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40" title="Sửa tên/giá">✎</button>
                  <button onClick={() => del(t)} disabled={isPending}
                    className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40" title="Xoá">🗑️</button>
                </>
              )}
            </div>
          ))}
          {toppings.length === 0 && <p className="px-1 py-6 text-center text-sm text-gray-400">Chưa có topping nào trong kho</p>}
        </div>
      </div>
      <div className="border-t border-gray-100 p-4">
        <div className="flex flex-col gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên topping (VD: Thêm trứng)" className="input" />
          <div className="flex gap-2">
            <input value={price} onChange={(e) => setPrice(formatVndTyping(e.target.value))} inputMode="numeric" placeholder="Giá (VNĐ)" className="input min-w-0 flex-1" />
            <button onClick={add} disabled={isPending} className="flex-shrink-0 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40">+ Thêm</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Checkbox tick chọn topping từ kho cho 1 món (trong modal sửa món)
function ItemToppingPicker({ item, toppings, router }: { item: MenuItem; toppings: Topping[]; router: ReturnType<typeof useRouter> }) {
  const [isPending, startTransition] = useTransition()
  // State local để tick hiện NGAY (optimistic); resync khi link đổi (sau refresh / đổi món)
  const linkedSig = (item.menu_item_toppings ?? []).map((l) => l.topping_id).sort().join(',')
  const [linked, setLinked] = useState<Set<string>>(
    () => new Set((item.menu_item_toppings ?? []).map((l) => l.topping_id)),
  )
  useEffect(() => {
    setLinked(new Set((item.menu_item_toppings ?? []).map((l) => l.topping_id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedSig])
  const toggle = (toppingId: string) => {
    const next = new Set(linked)
    if (next.has(toppingId)) next.delete(toppingId); else next.add(toppingId)
    setLinked(next) // hiện tick ngay, không chờ server
    startTransition(async () => { await setMenuItemToppings(item.id, [...next]); router.refresh() })
  }
  return (
    <div className="mt-2 border-t border-gray-100 pt-3">
      <p className="mb-2 text-sm font-semibold text-gray-700">Topping của món (tick để gán)</p>
      {toppings.length === 0 && <p className="text-xs text-gray-400">Kho topping trống — thêm ở khu "🧀 Topping" trước.</p>}
      <div className="flex flex-col gap-1.5">
        {toppings.slice().sort((a,b)=>a.sort_order-b.sort_order).map((t) => (
          <label key={t.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={linked.has(t.id)} disabled={isPending} onChange={() => toggle(t.id)} className="h-4 w-4" />
            <span className="flex-1 text-gray-800">{t.name}</span>
            <span className="text-gray-500">{formatVND(t.price)}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
// Khối nhập lựa chọn quyết định giá, hiện trong modal sửa món.
// Giá TUYỆT ĐỐI — gõ thẳng theo tờ menu giấy, không phải tính chênh lệch.
// (Khác topping: topping tick nhiều, tuỳ chọn, cộng thêm tiền.)
function ItemVariantEditor({ item, router }: { item: MenuItem; router: ReturnType<typeof useRouter> }) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [groupName, setGroupName] = useState(item.variant_group_name ?? '')
  const variants = (item.menu_item_variants ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)

  const add = () => {
    const parsed = parseVariantInput(name, price)
    if (!parsed.ok) { alert(parsed.error); return }
    startTransition(async () => {
      await addItemVariant(item.id, parsed.name, parsed.price)
      setName(''); setPrice(''); router.refresh()
    })
  }
  const toggle = (v: { id: string; is_available: boolean }) => startTransition(async () => {
    await updateItemVariant(v.id, { is_available: !v.is_available }); router.refresh()
  })
  const del = (v: { id: string; name: string }) => {
    const last = variants.length === 1
    const msg = last
      ? `Xoá lựa chọn cuối cùng "${v.name}"? Món sẽ quay về món thường, giá giữ ở mức hiện tại — nhớ kiểm tra lại giá món.`
      : `Xoá lựa chọn "${v.name}"?`
    if (!confirm(msg)) return
    startTransition(async () => { await deleteItemVariant(v.id); router.refresh() })
  }
  // Chỉ ghi khi tên nhóm thật sự đổi — onBlur bắn mỗi lần rời ô, không lọc thì bấm
  // qua lại trong modal là gửi hàng loạt lệnh ghi y hệt nhau.
  const saveGroupName = () => {
    if (groupName.trim() === (item.variant_group_name ?? '')) return
    startTransition(async () => {
      await setVariantGroupName(item.id, groupName); router.refresh()
    })
  }
  // Đổi thứ tự bằng nút ▲▼ thay vì kéo thả: danh sách chỉ 2-4 dòng, nút mũi tên
  // bấm chuẩn hơn trên điện thoại và không phải kéo theo thư viện drag nào.
  const move = (idx: number, delta: number) => {
    const next = variants.slice()
    const target = idx + delta
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    startTransition(async () => {
      await reorderItemVariants(item.id, next.map((v) => v.id)); router.refresh()
    })
  }

  return (
    <div className="mt-4 rounded-xl border border-gray-200 p-4">
      <p className="font-semibold text-gray-700">📐 Tuỳ chọn quyết định giá</p>
      <p className="mt-1 text-xs text-gray-500">
        Khách phải chọn đúng một. Giá gõ ở đây là giá bán thật của món, không phải tiền cộng thêm.
      </p>

      <input
        value={groupName}
        onChange={(e) => setGroupName(e.target.value)}
        onBlur={saveGroupName}
        placeholder="Tên nhóm (VD: Chọn cỡ, Chọn hãng)"
        className="input mt-3"
      />

      <div className="mt-3 space-y-2">
        {variants.map((v, idx) => (
          <div key={v.id} className="flex items-center gap-2 rounded-xl border border-gray-100 px-3 py-2">
            <span className="flex flex-shrink-0 flex-col leading-none">
              <button type="button" onClick={() => move(idx, -1)} disabled={isPending || idx === 0}
                className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Lên">▲</button>
              <button type="button" onClick={() => move(idx, 1)} disabled={isPending || idx === variants.length - 1}
                className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Xuống">▼</button>
            </span>
            <span className={`min-w-0 flex-1 truncate text-sm ${v.is_available ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
              {v.name}
            </span>
            <span className="flex-shrink-0 text-sm font-semibold text-gray-700">{formatVND(v.price)}</span>
            <button type="button" onClick={() => toggle(v)} disabled={isPending}
              className="flex-shrink-0 text-xs text-gray-500 hover:text-orange-600 disabled:opacity-40">
              {v.is_available ? 'Tắt bán' : 'Bật bán'}
            </button>
            <button type="button" onClick={() => del(v)} disabled={isPending}
              className="flex-shrink-0 text-xs text-red-500 hover:text-red-700 disabled:opacity-40">Xoá</button>
          </div>
        ))}
        {variants.length === 0 && (
          <p className="px-1 py-3 text-center text-sm text-gray-400">
            Chưa có lựa chọn nào — món đang bán theo giá món.
          </p>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Tên lựa chọn (VD: Đĩa to)" className="input min-w-0 flex-1" />
        {/* class riêng cho ô giá, KHÔNG dùng .input (width:100% sẽ bóp hỏng ô trong flex) */}
        <input value={price} onChange={(e) => setPrice(formatVndTyping(e.target.value))} inputMode="numeric" placeholder="Giá"
          className="w-24 flex-shrink-0 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-orange-400" />
        <button type="button" onClick={add} disabled={isPending}
          className="flex-shrink-0 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40">+ Thêm</button>
      </div>
    </div>
  )
}
