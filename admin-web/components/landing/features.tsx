import type { ReactNode } from 'react'
import { ArrowRight, BellRing, Check, Mic, Play, Send } from 'lucide-react'
import { SITE, VIDEOS } from '@/lib/landing/site'
import { LazyVideo } from './lazy-video'
import { FadeInUp } from './reveal'
import { Badge, Em, PrimaryButton } from './ui'

// Hai khối tính năng chính, bố cục 2 cột xen kẽ chữ / minh hoạ. Thẻ minh hoạ là giao diện mô phỏng
// (dữ liệu ví dụ), không phải ảnh chụp màn hình thật.

function Mockup({ video, children }: { video: readonly string[]; children: ReactNode }) {
  return (
    <div className="relative flex min-h-[26rem] items-center justify-center overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-8">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(234,88,12,0.35),transparent_60%),radial-gradient(ellipse_at_80%_90%,rgba(250,204,21,0.15),transparent_55%)]" />
      <LazyVideo sources={video} className="absolute inset-0 h-full w-full object-cover" />
      <div aria-hidden className="absolute inset-0 bg-black/20" />
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  )
}

function Card({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="img" aria-label={label} className="rounded-2xl border border-white/10 bg-[#1C1C1E]/90 p-4 shadow-2xl backdrop-blur-xl">
      {children}
    </div>
  )
}

function FeatureText({ badge, title, body, points }: { badge: ReactNode; title: ReactNode; body: string; points: string[] }) {
  return (
    <FadeInUp>
      <div className="mb-6">{badge}</div>
      <h2 className="text-4xl font-semibold leading-[1.1] tracking-tight text-white md:text-5xl">{title}</h2>
      <p className="mt-6 text-[16px] leading-relaxed text-gray-400">{body}</p>
      <ul className="mt-6 space-y-3">
        {points.map((p) => (
          <li key={p} className="flex gap-3 text-[15px] text-gray-300">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-white" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <PrimaryButton href={SITE.zaloUrl} external>
          Đăng ký dùng thử <ArrowRight aria-hidden className="size-4" />
        </PrimaryButton>
      </div>
    </FadeInUp>
  )
}

export function FeatureOrdering() {
  return (
    <section id="features" className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
      <FeatureText
        badge={<Badge tone="amber">✨ Gọi món QR</Badge>}
        title={<>Khách tự gọi món, <Em>quán bớt chạy bàn.</Em></>}
        body="Khách quét mã QR ở bàn hoặc phòng, menu có ảnh mở ngay trong Zalo. Chọn món, ghi chú cho bếp, thanh toán bằng VietQR. Không cần tải app, không cần đăng ký tài khoản."
        points={[
          'Đặt bàn trước: khách chọn giờ, quán giữ bàn trên sơ đồ',
          'Thanh toán VietQR, tiền về thẳng tài khoản của quán',
          'Trả trước hoặc trả sau, tuỳ mô hình quán',
        ]}
      />
      <FadeInUp delay={150}>
        <Mockup video={VIDEOS.featureOrder}>
          <Card label="Minh hoạ: khách gọi món trên Zalo Mini App">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Bàn 3</p>
              <p className="text-xs text-gray-400">Menu quán</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {['Món chính', 'Lẩu', 'Đồ uống', 'Gọi thêm'].map((c, i) => (
                <span key={c} className={`rounded-full px-3 py-1.5 text-xs font-medium ${i === 0 ? 'bg-white text-black' : 'bg-white/10 text-gray-300'}`}>
                  {c}
                </span>
              ))}
            </div>
            <ul className="mt-4 divide-y divide-white/5 text-sm">
              {[
                ['Phở gà đặc biệt', '×1', '80.000đ'],
                ['Nước cam tươi', '×1', '25.000đ'],
              ].map(([name, qty, price]) => (
                <li key={name} className="flex items-center justify-between py-2.5">
                  <span className="text-gray-200">{name} <span className="text-gray-400">{qty}</span></span>
                  <span className="font-medium tabular text-white">{price}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5">
              <span className="flex-1 text-sm text-gray-400">Ghi chú cho bếp…</span>
              <Mic aria-hidden className="size-4 text-gray-400" />
              <span className="flex size-8 items-center justify-center rounded-full bg-white text-black">
                <Send aria-hidden className="size-4" />
              </span>
            </div>
            <div className="mt-3 rounded-xl bg-orange-600 px-4 py-3 text-center text-sm font-semibold text-white">
              Gửi đơn · <span className="tabular">105.000đ</span>
            </div>
          </Card>
        </Mockup>
      </FadeInUp>
    </section>
  )
}

const WAVE = [6, 12, 20, 14, 26, 18, 30, 22, 12, 24, 16, 28, 10, 20, 26, 14, 8, 18, 24, 12, 22, 16, 10, 6]

export function FeatureRealtime() {
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
      <FadeInUp className="order-2 lg:order-1">
        <Mockup video={VIDEOS.featureRealtime}>
          <Card label="Minh hoạ: đơn mới hiện trên màn hình quầy và được đọc to">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-black">
                <Play aria-hidden className="size-4 translate-x-px" fill="currentColor" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white"><span className="tabular">11:06</span> – Bàn 3</p>
                <p className="text-xs text-gray-400">Loa đọc đơn</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                <BellRing aria-hidden className="size-3" /> Đơn mới
              </span>
            </div>
            <div aria-hidden className="mt-4 flex h-10 items-center gap-[3px]">
              {WAVE.map((h, i) => (
                <span key={i} className={`w-1.5 rounded-full ${i < 14 ? 'bg-emerald-300' : 'bg-white/20'}`} style={{ height: `${h + 4}px` }} />
              ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-gray-200">“Bàn 3 gọi thêm: hai bia hơi, một lẩu ếch.”</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              {[
                ['Bàn 1', 'Đang phục vụ', 'text-emerald-300'],
                ['Bàn 3', 'Chờ duyệt', 'text-amber-300'],
                ['Bàn 5', 'Đã đặt', 'text-orange-300'],
              ].map(([t, s, c]) => (
                <div key={t} className="rounded-lg border border-white/10 bg-black/30 px-2 py-2">
                  <p className="font-semibold text-white">{t}</p>
                  <p className={`mt-0.5 ${c}`}>{s}</p>
                </div>
              ))}
            </div>
          </Card>
        </Mockup>
      </FadeInUp>
      <div className="order-1 lg:order-2">
        <FeatureText
          badge={<Badge tone="emerald">✨ Quản lý realtime</Badge>}
          title={<>Cả quán trên một màn hình, <Em>đơn mới có loa đọc.</Em></>}
          body="Sơ đồ bàn cập nhật theo thời gian thực. Đơn mới có chuông và loa đọc tên món, quán ồn vẫn không sót đơn. Thu ngân duyệt đơn, in phiếu bếp, thu tiền ngay tại quầy."
          points={[
            'Ghép bàn, ghép mâm cho khách đoàn, gộp bill khi tính tiền',
            'In hoá đơn và phiếu bếp trên máy in nhiệt 80mm',
            'Thông báo khi khách chuyển khoản',
          ]}
        />
      </div>
    </section>
  )
}
