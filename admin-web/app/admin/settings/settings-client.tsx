'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { updateStoreSettings } from '@/lib/actions/store'
import SquareCropper from '../menu/square-cropper'

interface ServingShift {
  open: string
  close: string
}

interface Props {
  name: string
  logoUrl: string | null
  paymentMethods: string[]
  zaloOaUrl: string
  address: string
  phone: string
  aboutText: string
  takeawayBannerUrl: string | null
  wifiName: string
  wifiPassword: string
  isAcceptingOrders: boolean
  servingHours: ServingShift[]
  deliveryAreaNote: string
  termsOfUse: string
  orderFlow: OrderFlow
  staffOrderNeedsPayment: boolean
  kitchenAutoPrint: boolean
  printerPaperWidth: PaperWidth
}

type OrderFlow = 'prepay' | 'postpay'
type PaperWidth = '58' | '80'

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

export default function SettingsClient({ name, logoUrl, paymentMethods, zaloOaUrl, address, phone, aboutText, takeawayBannerUrl, wifiName, wifiPassword, isAcceptingOrders, servingHours, deliveryAreaNote, termsOfUse, orderFlow, staffOrderNeedsPayment, kitchenAutoPrint, printerPaperWidth }: Props) {
  const router = useRouter()
  const [logo, setLogo] = useState<File | null>(null)
  const [banner, setBanner] = useState<File | null>(null)
  const [removeBanner, setRemoveBanner] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [methods, setMethods] = useState<Set<string>>(new Set(paymentMethods))
  const [accepting, setAccepting] = useState(isAcceptingOrders)
  const [shifts, setShifts] = useState<ServingShift[]>(servingHours ?? [])
  const [flow, setFlow] = useState<OrderFlow>(orderFlow)
  const [staffNeedsPay, setStaffNeedsPay] = useState(staffOrderNeedsPayment)
  const [autoPrint, setAutoPrint] = useState(kitchenAutoPrint)
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(printerPaperWidth)

  const addShift = () => setShifts((prev) => [...prev, { open: '08:00', close: '22:00' }])
  const removeShift = (i: number) => setShifts((prev) => prev.filter((_, idx) => idx !== i))
  const updateShift = (i: number, key: keyof ServingShift, val: string) =>
    setShifts((prev) => prev.map((s, idx) => (idx === i ? { ...s, [key]: val } : s)))

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 2500)
    return () => clearTimeout(t)
  }, [saved])

  // Quán "Trả sau" có payment_methods = ['counter'] — không phải phương thức khách chọn trong
  // app. Gạt về "Trả trước" mà không mồi lại thì hai ô ZaloPay/Tiền mặt trống trơn, bấm Lưu
  // ăn lỗi "Phải chọn ít nhất 1 phương thức" mà không hiểu vì sao. Mồi ZaloPay cho đúng mặc
  // định cashless-first (quyết định 2026-06-28). Làm trong handler chứ không trong effect —
  // đây là hệ quả của một cú bấm, không phải trạng thái phải đồng bộ lại mỗi lần render.
  const changeFlow = (next: OrderFlow) => {
    setFlow(next)
    if (next !== 'prepay') return
    setMethods((prev) => {
      const usable = [...prev].filter((m) => m === 'zalo_checkout' || m === 'cash')
      return usable.length > 0 ? prev : new Set(['zalo_checkout'])
    })
  }

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
        fd.set('is_accepting_orders', accepting ? '1' : '0')
        fd.set('order_flow', flow)
        fd.set('staff_order_needs_payment', staffNeedsPay ? '1' : '0')
        fd.set('kitchen_auto_print', autoPrint ? '1' : '0')
        fd.set('printer_paper_width', paperWidth)
        // Chỉ giữ ca có đủ open+close
        const validShifts = shifts.filter((s) => s.open && s.close)
        fd.set('serving_hours', JSON.stringify(validShifts))
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

      {/* Cấu hình Wifi — hiện ở tab "Nhà hàng" trên mini-app, để trống = không hiện */}
      <div>
        <label className="label">Tên wifi</label>
        <input
          name="wifi_name"
          defaultValue={wifiName}
          placeholder="VD: PhoGaPubu_Free"
          className="input"
        />
      </div>
      <div>
        <label className="label">Mật khẩu wifi</label>
        <input
          name="wifi_password"
          defaultValue={wifiPassword}
          placeholder="VD: pubu2024"
          className="input"
        />
        <p className="mt-1 text-xs text-gray-400">
          Hiện ở tab &quot;Nhà hàng&quot; trên mini-app, khách bấm là sao chép mật khẩu. Để trống tên wifi = không hiện.
        </p>
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

      {/* Điều khoản sử dụng — Markdown nhẹ, hiện ở tab "Nhà hàng" khi khách bấm */}
      <div>
        <label className="label">Điều khoản sử dụng</label>
        <textarea
          name="terms_of_use"
          defaultValue={termsOfUse}
          placeholder={"# Điều khoản sử dụng\n\n## Đặt món\n- Khách chọn món và thanh toán ngay trên Zalo\n\n## Liên hệ\n- Hotline: 0901 234 567"}
          rows={10}
          className="input resize-none font-mono text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">
          Hiện ở tab &quot;Nhà hàng&quot; trên mini-app khi khách bấm &quot;Điều khoản sử dụng&quot;.
          Hỗ trợ Markdown nhẹ: <code># Tiêu đề</code>, <code>## Tiêu đề nhỏ</code>,{' '}
          <code>- gạch đầu dòng</code>, <code>**in đậm**</code>, <code>[chữ](link)</code>.
          Để trống = dùng mẫu điều khoản mặc định của MEVO.
        </p>
      </div>

      {/* Giờ phục vụ */}
      <div className="rounded-xl border-2 border-gray-200 p-3">
        <label className="flex cursor-pointer items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Đang nhận đơn</p>
            <p className="text-xs text-gray-500">
              Tắt = tạm nghỉ, chặn mọi đơn (cả QR bàn lẫn mang về)
            </p>
          </div>
          <input
            type="checkbox"
            className="sr-only"
            checked={accepting}
            onChange={() => setAccepting((v) => !v)}
          />
          <div className={`h-6 w-11 rounded-full transition-colors ${accepting ? 'bg-green-500' : 'bg-gray-300'}`}>
            <div className={`h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${accepting ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </div>
        </label>

        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-sm font-semibold text-gray-900">Giờ phục vụ</p>
          <p className="mb-2 text-xs text-gray-500">
            Ngoài giờ sẽ chặn đặt món. Không thêm ca nào = mở cả ngày. Thêm nhiều ca cho quán nghỉ trưa.
          </p>
          <div className="flex flex-col gap-2">
            {shifts.length === 0 && (
              <p className="text-xs text-gray-400">Chưa có ca — quán mở cả ngày.</p>
            )}
            {shifts.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="time"
                  value={s.open}
                  onChange={(e) => updateShift(i, 'open', e.target.value)}
                  className="input flex-1"
                />
                <span className="text-gray-400">–</span>
                <input
                  type="time"
                  value={s.close}
                  onChange={(e) => updateShift(i, 'close', e.target.value)}
                  className="input flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeShift(i)}
                  className="rounded-lg px-2 py-1 text-sm text-red-500 hover:bg-red-50"
                  aria-label="Xoá ca"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addShift}
            className="mt-2 rounded-lg border border-orange-300 px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50"
          >
            + Thêm ca phục vụ
          </button>
        </div>
      </div>

      {/* Phạm vi ship (chỉ hiển thị cho khách) */}
      <div>
        <label className="label">Phạm vi ship (hiển thị cho khách)</label>
        <input
          name="delivery_area_note"
          defaultValue={deliveryAreaNote}
          placeholder="VD: Ship trong bán kính ~3km khu vực TP. Lào Cai"
          className="input"
        />
        <p className="mt-1 text-xs text-gray-400">
          Chỉ hiển thị ở tab &quot;Nhà hàng&quot; trên mini-app để khách tham khảo. Không tự động chặn đơn ngoài vùng.
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

      <div className="rounded-xl border-2 border-gray-200 p-4">
        <label className="label">Quy trình vận hành</label>
        <p className="mb-3 text-xs text-gray-400">
          Mỗi quán một kiểu. Đổi ở đây, không cần sửa gì trong mini-app.
        </p>

        <div className="flex flex-col gap-2">
          <FlowCard
            label="Trả trước"
            description="Khách thanh toán trong app rồi bếp mới làm. Hợp quán ăn nhanh, khách vãng lai."
            checked={flow === 'prepay'}
            onChange={() => changeFlow('prepay')}
          />
          <FlowCard
            label="Trả sau"
            description="Khách gọi món nhiều lượt, in phiếu xác nhận tại bàn, thanh toán một lần tại quầy. Hợp quán nhậu, quán ngồi lâu."
            checked={flow === 'postpay'}
            onChange={() => changeFlow('postpay')}
          />
        </div>

        {flow !== orderFlow && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
            Đổi quy trình chỉ được khi không còn bàn nào chưa thanh toán. Nếu còn, hệ thống sẽ
            báo lỗi khi bấm Lưu.
          </p>
        )}

        {/* Chỉ có nghĩa ở prepay — postpay không đơn nào chờ tiền để vào bếp */}
        {flow === 'prepay' && (
          <div className="mt-3">
            <PaymentToggle
              id="staff_order_needs_payment"
              label="Đơn nhân viên đặt hộ phải thu tiền trước"
              description="Bật: nhân viên thu tiền xong bếp mới làm. Tắt: bếp làm ngay (nhân viên đứng cạnh khách là đủ)."
              checked={staffNeedsPay}
              disabled={false}
              onChange={() => setStaffNeedsPay((v) => !v)}
            />
          </div>
        )}

        <div className="mt-3 flex flex-col gap-2">
          <PaymentToggle
            id="kitchen_auto_print"
            label="Tự in phiếu khi có đơn mới"
            description="Máy in nhiệt nối với máy tính đang mở màn bếp/quầy."
            checked={autoPrint}
            disabled={false}
            onChange={() => setAutoPrint((v) => !v)}
          />
          {autoPrint && (
            <div className="flex items-center gap-3 pl-1">
              <span className="text-sm text-gray-600">Khổ giấy</span>
              {(['58', '80'] as PaperWidth[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setPaperWidth(w)}
                  className={`rounded-lg border-2 px-3 py-1 text-sm font-semibold transition-colors ${
                    paperWidth === w
                      ? 'border-orange-400 bg-orange-50 text-orange-600'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  {w}mm
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {flow === 'prepay' ? (
        <div>
          <label className="label">Phương thức thanh toán</label>
          <p className="mb-2 text-xs text-gray-400">
            Bật ít nhất 1 phương thức. Quán hướng tới ZaloPay để tránh gọi giả mạo.
          </p>
          <div className="flex flex-col gap-2">
            <PaymentToggle
              id="zalo_checkout"
              label="ZaloPay"
              description="Khách thanh toán trong Zalo trước khi bếp làm"
              checked={methods.has('zalo_checkout')}
              disabled={methods.size === 1 && methods.has('zalo_checkout')}
              onChange={() => toggleMethod('zalo_checkout')}
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
      ) : (
        <div>
          <label className="label">Phương thức thanh toán</label>
          <p className="mt-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
            Quán trả sau chỉ thu tiền một lần tại quầy cuối bữa, nên không cần chọn phương thức
            trong app. Nhân viên chọn <b>Tiền mặt</b> hay <b>Chuyển khoản</b> lúc bấm thu tiền,
            và báo cáo doanh thu tách riêng hai loại.
          </p>
        </div>
      )}

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

// Thẻ chọn quy trình — dạng radio chứ không phải toggle: đổi nhầm là đổi cả cách quán chạy,
// nên phải thấy rõ hai lựa chọn cạnh nhau kèm giải thích, không phải một cái gạt mù mờ.
function FlowCard({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors ${
        checked ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white'
      }`}
    >
      <input
        type="radio"
        name="order_flow_choice"
        className="sr-only"
        checked={checked}
        onChange={onChange}
      />
      <div
        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
          checked ? 'border-orange-500' : 'border-gray-300'
        }`}
      >
        {checked && <div className="h-2.5 w-2.5 rounded-full bg-orange-500" />}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </label>
  )
}
