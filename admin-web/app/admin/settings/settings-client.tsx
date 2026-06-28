'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { updateStoreSettings } from '@/lib/actions/store'
import SquareCropper from '../menu/square-cropper'

interface Props {
  name: string
  logoUrl: string | null
  paymentMethods: string[]
  zaloOaUrl: string
  address: string
  phone: string
  aboutText: string
  takeawayBannerUrl: string | null
}

// Nén ảnh banner phía client: thu nhỏ về tối đa 1600px chiều rộng + JPEG q0.85.
// Tránh vượt giới hạn body của Server Action và giữ ảnh nhẹ khi khách tải trên mini-app.
async function compressBanner(file: File): Promise<File> {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = () => reject(new Error('Không đọc được ảnh'))
      im.src = url
    })
    const MAX_W = 1600
    const scale = Math.min(1, MAX_W / image.width)
    const w = Math.round(image.width * scale)
    const h = Math.round(image.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(image, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    )
    return blob ? new File([blob], 'banner.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function SettingsClient({ name, logoUrl, paymentMethods, zaloOaUrl, address, phone, aboutText, takeawayBannerUrl }: Props) {
  const router = useRouter()
  const [logo, setLogo] = useState<File | null>(null)
  const [banner, setBanner] = useState<File | null>(null)
  const [removeBanner, setRemoveBanner] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [methods, setMethods] = useState<Set<string>>(new Set(paymentMethods))

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 2500)
    return () => clearTimeout(t)
  }, [saved])

  const toggleMethod = (method: string) => {
    setMethods((prev) => {
      const next = new Set(prev)
      if (next.has(method)) {
        if (next.size <= 1) return prev
        next.delete(method)
      } else {
        next.add(method)
      }
      return next
    })
  }

  return (
    <form
      action={async (fd) => {
        setError('')
        if (logo) fd.set('logo', logo)
        if (banner) fd.set('banner', banner)
        if (removeBanner) fd.set('remove_banner', '1')
        methods.forEach((m) => fd.append('payment_methods', m))
        try {
          await updateStoreSettings(fd)
          setLogo(null)
          setBanner(null)
          setRemoveBanner(false)
          setSaved(true)
          router.refresh()
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Lỗi khi lưu')
        }
      }}
      className="flex max-w-md flex-col gap-4 text-gray-900"
    >
      <div>
        <label className="label">Tên quán *</label>
        <input
          name="name"
          required
          defaultValue={name}
          placeholder="VD: Phở Gà Pubu"
          className="input"
        />
      </div>

      <div>
        <label className="label">Logo quán (vuông 1:1)</label>
        <SquareCropper initialUrl={logoUrl} onChange={setLogo} />
        <p className="mt-1 text-xs text-gray-400">
          Hiện ở đầu trang menu + header trên mini-app của khách.
        </p>
      </div>

      {/* Địa chỉ quán */}
      <div>
        <label className="label">Địa chỉ quán</label>
        <input
          name="address"
          defaultValue={address}
          placeholder="VD: 12 Phố Núi, TP. Lào Cai"
          className="input"
        />
      </div>

      {/* Số điện thoại */}
      <div>
        <label className="label">Số điện thoại</label>
        <input
          name="phone"
          type="tel"
          defaultValue={phone}
          placeholder="VD: 0901 234 567"
          className="input"
        />
      </div>

      {/* Ghi chú / Lời nhắn */}
      <div>
        <label className="label">Ghi chú / Lời nhắn</label>
        <textarea
          name="about_text"
          defaultValue={aboutText}
          placeholder="VD: Cảm ơn bạn đã ghé Phở Gà Pubu! Hotline: 0901234567"
          rows={3}
          className="input resize-none"
        />
        <p className="mt-1 text-xs text-gray-400">
          Hiện ở tab &quot;Nhà hàng&quot; trên mini-app. Có thể ghi lời cảm ơn, hotline, chính sách...
        </p>
      </div>

      {/* Banner Mang về */}
      <div>
        <label className="label">Banner Mang về / Ship (tỉ lệ 4:1)</label>
        {takeawayBannerUrl && !banner && !removeBanner && (
          <div className="relative mb-2">
            <img
              src={takeawayBannerUrl}
              alt="Banner hiện tại"
              className="w-full rounded-lg object-cover"
              style={{ aspectRatio: '4/1' }}
            />
            <button
              type="button"
              onClick={() => setRemoveBanner(true)}
              className="absolute right-2 top-2 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-medium text-white hover:bg-black/75"
            >
              Xoá banner
            </button>
          </div>
        )}
        {banner && (
          <img
            src={URL.createObjectURL(banner)}
            alt="Preview banner mới"
            className="mb-2 w-full rounded-lg object-cover"
            style={{ aspectRatio: '4/1' }}
          />
        )}
        {removeBanner && !banner && (
          <p className="mb-2 text-xs text-orange-500">
            Banner sẽ bị xoá khi bấm Lưu.{' '}
            <button type="button" onClick={() => setRemoveBanner(false)} className="underline">
              Hoàn tác
            </button>
          </p>
        )}
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) {
              setRemoveBanner(false)
              setBanner(await compressBanner(f))
            } else {
              setBanner(null)
            }
          }}
          className="block text-sm text-gray-600"
        />
        <p className="mt-1 text-xs text-gray-400">
          Hiện ở menu khi khách mở app không quét QR. Tỉ lệ 4:1 (VD: 1200×300px). Để trống = không hiện.
        </p>
      </div>

      <div>
        <label className="label">Link trang Zalo OA</label>
        <input
          name="zalo_oa_url"
          type="url"
          defaultValue={zaloOaUrl}
          placeholder="https://zalo.me/phogapubu"
          className="input"
        />
        <p className="mt-1 text-xs text-gray-400">
          Link trang Zalo OA của quán. Khách bấm vào tab "Nhà hàng" sẽ thấy nút mở trang này.
          Lấy tại Zalo OA Manager → Thông tin cơ bản → Link chia sẻ.
        </p>
      </div>

      <div>
        <label className="label">Phương thức thanh toán</label>
        <p className="mb-2 text-xs text-gray-400">
          Bật ít nhất 1 phương thức. Quán hướng tới ZaloPay để tránh gọi giả mạo.
        </p>
        <div className="flex flex-col gap-2">
          <PaymentToggle
            id="zalopay"
            label="ZaloPay"
            description="Khách thanh toán trong Zalo trước khi bếp làm"
            checked={methods.has('zalopay')}
            disabled={methods.size === 1 && methods.has('zalopay')}
            onChange={() => toggleMethod('zalopay')}
          />
          <PaymentToggle
            id="cash"
            label="Tiền mặt"
            description="Khách trả tiền mặt với nhân viên khi ra về"
            checked={methods.has('cash')}
            disabled={methods.size === 1 && methods.has('cash')}
            onChange={() => toggleMethod('cash')}
          />
        </div>
        {methods.size === 1 && (
          <p className="mt-1.5 text-xs text-orange-500">
            Phải bật ít nhất 1 phương thức thanh toán.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          className="rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Lưu
        </button>
        {saved && <span className="text-sm text-green-600">✓ Đã lưu</span>}
      </div>
    </form>
  )
}

function PaymentToggle({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: () => void
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between rounded-xl border-2 p-3 transition-colors ${
        checked ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <div>
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <input
        type="checkbox"
        className="sr-only"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <div
        className={`h-6 w-11 rounded-full transition-colors ${
          checked ? 'bg-orange-500' : 'bg-gray-200'
        }`}
      >
        <div
          className={`h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </div>
    </label>
  )
}
