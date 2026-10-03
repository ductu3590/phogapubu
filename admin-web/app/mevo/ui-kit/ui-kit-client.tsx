'use client'

import { useId, useState, type ReactNode } from 'react'
import {
  CalendarDays,
  Check,
  LayoutGrid,
  LogOut,
  Plus,
  Printer,
  Receipt,
  Search,
  Settings,
  Trash2,
  UtensilsCrossed,
  Users,
} from 'lucide-react'
import { AppShell } from '@/components/ui/app-shell'
import { Badge, StatusDot, TableStateBadge, TableStateLegend } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { Card, PageHeader } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Banner, EmptyState, ErrorState, SkeletonList, Spinner } from '@/components/ui/feedback'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { TABLE_STATE_ORDER } from '@/components/ui/status'
import { Tabs } from '@/components/ui/tabs'
import { ToastProvider, useToast } from '@/components/ui/toast'
import { formatVND } from '@/lib/utils'
import PosTilesDemo from './pos-tiles-demo'
import PosTimelineDemo from './pos-timeline-demo'
import PosWorkQueueDemo from './pos-work-queue-demo'
import PosBillDemo from './pos-bill-demo'
import PosReceptionDemo from './pos-reception-demo'

// Dữ liệu minh hoạ — cố ý có ca biên: tên dài, số 9 chữ số, số 0.
const SAMPLE_ROWS = [
  { name: 'Lẩu riêu cua bắp bò sườn sụn (nồi lớn, thêm rau rừng Tây Bắc)', qty: 2, price: 450000 },
  { name: 'Bia Tiger bạc (tháp 3 lít)', qty: 4, price: 340000 },
  { name: 'Khăn lạnh', qty: 10, price: 2000 },
  { name: 'Rau rừng (tặng)', qty: 1, price: 0 },
]

const COLOR_SWATCHES: { name: string; className: string; hex: string }[] = [
  { name: 'Nền trang', className: 'bg-background', hex: '#F1F5F9' },
  { name: 'Bề mặt', className: 'bg-surface', hex: '#FFFFFF' },
  { name: 'Viền', className: 'bg-border', hex: '#E2E8F0' },
  { name: 'Viền ô nhập', className: 'bg-border-strong', hex: '#CBD5E1' },
  { name: 'Chữ phụ', className: 'bg-muted', hex: '#475569' },
  { name: 'Chữ chính', className: 'bg-foreground', hex: '#0F172A' },
  { name: 'Nút chính', className: 'bg-primary', hex: '#C2410C' },
  { name: 'Cam MEVO (logo)', className: 'bg-brand', hex: '#EA580C' },
  { name: 'Nền đang chọn', className: 'bg-primary-light', hex: '#FFF7ED' },
]

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function ToastTriggers() {
  const toast = useToast()
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => toast({ tone: 'success', title: 'Đã xác nhận món', description: 'Lượt #03 · Bàn 09' })}>Toast thành công</Button>
      <Button onClick={() => toast({ tone: 'info', title: 'Có 1 yêu cầu gọi nhân viên mới' })}>Toast thông tin</Button>
      <Button onClick={() => toast({ tone: 'error', title: 'Không mở được phiếu in', description: 'Món vẫn đã được xác nhận. Bấm "In lại".' })}>
        Toast lỗi
      </Button>
    </div>
  )
}

function UiKitBody() {
  const nameId = useId()
  const phoneId = useId()
  const noteId = useId()
  const areaId = useId()
  const [statusTab, setStatusTab] = useState<'all' | 'pending' | 'done'>('all')
  const [detailTab, setDetailTab] = useState<'bill' | 'rounds' | 'history'>('bill')
  const [viewTab, setViewTab] = useState<'timeline' | 'map'>('timeline')
  const [isSaving, setIsSaving] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isSideOpen, setIsSideOpen] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [phone, setPhone] = useState('0912 345')

  function fakeSave() {
    setIsSaving(true)
    window.setTimeout(() => setIsSaving(false), 1500)
  }

  function fakeRetry() {
    setIsRetrying(true)
    window.setTimeout(() => setIsRetrying(false), 1200)
  }

  const phoneError = phone.replace(/\D/g, '').length < 10 ? 'Số điện thoại cần đủ 10 số' : undefined

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-6 md:px-6 md:py-8">
      <PageHeader
        title="Bộ giao diện MEVO"
        description="Bản xem thử design system (UI-1). Dữ liệu trên trang này là minh hoạ, không đọc hay ghi database."
        actions={
          <>
            <Button icon={<Printer />}>In thử</Button>
            <Button variant="primary" icon={<Plus />}>
              Thêm món
            </Button>
          </>
        }
      />

      <Section title="Màu" description="Nền slate phẳng, một màu nhấn. Cam chỉ dành cho nút và dấu nhận diện, không dùng làm trạng thái.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {COLOR_SWATCHES.map((swatch) => (
            <div key={swatch.name} className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className={`h-14 border-b border-border ${swatch.className}`} />
              <div className="px-3 py-2">
                <p className="text-sm font-medium text-foreground">{swatch.name}</p>
                <p className="text-xs text-muted tabular">{swatch.hex}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Chữ" description="Be Vietnam Pro. Chữ nhỏ nhất 12px ở admin, 13px trên POS. Số tiền dùng chữ số thẳng hàng (.tabular).">
        <Card>
          <div className="space-y-3">
            <p className="text-[28px] leading-9 font-semibold tabular">2.150.000đ</p>
            <p className="text-2xl font-semibold">Tiêu đề trang — Thanh toán & đóng mâm</p>
            <p className="text-xl font-semibold">Tiêu đề panel — Mâm 09 + 10 (ghép 2 bàn)</p>
            <p className="text-base font-semibold">Tiêu đề card — Lượt gọi mới</p>
            <p className="text-base">Chữ thân 16px: Quý khách thanh toán tại quầy khi kết thúc bữa tiệc.</p>
            <p className="text-sm text-muted">Chữ phụ 14px: Giờ vào 18:15 · 8 khách · Khu Tầng 1 máy lạnh</p>
            <p className="text-[13px] text-muted">Nhãn POS 13px: Chờ duyệt · Đã đặt 19:30</p>
            <p className="text-xs text-muted">Chú thích 12px: Lần đồng bộ gần nhất 19:15</p>
            <p className="text-base">Dấu tiếng Việt chồng: Quyết định hưởng ưu đãi — Nguyễn Thị Huyền Trang, Lẩu riêu cua.</p>
          </div>
        </Card>
      </Section>

      <Section title="Nút" description="Mặc định là nút viền. Mỗi khu chỉ một nút chính. Màn chạm (POS) dùng cỡ touch 48px.">
        <Card>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary">Xác nhận món</Button>
              <Button>Nút viền (mặc định)</Button>
              <Button variant="secondary">Nút phụ</Button>
              <Button variant="ghost">Nút chữ</Button>
              <Button variant="danger" icon={<Trash2 />}>
                Bỏ món
              </Button>
              <Button disabled>Đang khoá</Button>
              <IconButton icon={<Search />} label="Tìm bàn" className="border border-border-strong bg-surface" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" icon={<Check />} isLoading={isSaving} onClick={fakeSave}>
                Lưu (bấm thử)
              </Button>
              <Button isLoading={isSaving} onClick={fakeSave}>
                Nút chỉ chữ đang gửi
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="touch" icon={<Receipt />}>
                Thanh toán 2.150.000đ
              </Button>
              <Button size="touch">Gọi thêm món</Button>
            </div>
            <div className="max-w-56">
              <Button className="w-full">Nhãn rất dài sẽ xuống dòng chứ không tràn ra ngoài nút</Button>
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Trạng thái" description="Một bảng màu duy nhất cho cả hệ. Luôn có chữ đi kèm màu.">
        <Card>
          <div className="space-y-4">
            <TableStateLegend />
            <div className="flex flex-wrap gap-2">
              {TABLE_STATE_ORDER.map((state) => (
                <TableStateBadge key={state} state={state} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">Đã thu tiền</Badge>
              <Badge tone="warning">Chưa thu</Badge>
              <Badge tone="critical">Đã huỷ</Badge>
              <Badge tone="neutral">Tặng · 0đ</Badge>
              <Badge tone="info" icon={<CalendarDays />}>
                Đặt bàn 20:00
              </Badge>
            </div>
            <p className="flex items-center gap-2 text-sm">
              <StatusDot tone="success" /> Bàn 09 — chấm luôn đứng cạnh chữ, không đứng một mình
            </p>
          </div>
        </Card>
      </Section>

      <Section title="Ô bàn POS" description="Đúng component Sơ đồ bàn của /admin/pos, dữ liệu minh hoạ. Nền ô trắng; màu mâm chỉ ở vạch trái; trạng thái = chấm + chữ.">
        <PosTilesDemo />
      </Section>

      <Section title="Timeline POS" description="Đúng component Timeline của /admin/pos, dữ liệu minh hoạ đặt theo giờ hiện tại. Thanh liền = phiên đang mở, viền đứt = đặt bàn.">
        <PosTimelineDemo />
      </Section>

      <Section title="Việc cần xử lý (POS)" description="Cột phải của /admin/pos: một danh sách gộp, việc gấp lên đầu, lọc theo loại. Dữ liệu minh hoạ, nút không làm gì.">
        <PosWorkQueueDemo />
      </Section>

      <Section title="Bill POS" description="Bill của /admin/pos: tab Hoá đơn / Lượt gọi mới / Lịch sử in; Thanh toán khoá khi còn lượt chờ duyệt. Bấm Thanh toán ở bill bên phải để xem màn thu tiền. Dữ liệu minh hoạ.">
        <div className="flex flex-wrap gap-4">
          <PosBillDemo withPending />
          <PosBillDemo withPending={false} />
        </div>
      </Section>

      <Section title="Tiếp nhận khách đặt bàn (POS)" description="Bấm thanh đặt bàn trên Timeline /admin/pos → panel này. Dữ liệu minh hoạ (khách trễ 25 phút, có món đặt trước), nút không làm gì.">
        <PosReceptionDemo />
      </Section>

      <Section title="Form" description="Nhãn trên ô. Lỗi hiện ngay dưới ô và giữ nguyên chữ đã gõ.">
        <Card>
          <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
            <Field label="Tên khách" htmlFor={nameId} required hint="Hiện trên timeline và phiếu in">
              <Input id={nameId} defaultValue="Nguyễn Minh An" />
            </Field>
            <Field label="Số điện thoại" htmlFor={phoneId} error={phoneError}>
              <Input
                id={phoneId}
                inputMode="tel"
                value={phone}
                invalid={Boolean(phoneError)}
                aria-describedby={`${phoneId}-message`}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
            <Field label="Khu vực" htmlFor={areaId}>
              <Select id={areaId} defaultValue="indoor">
                <option value="garden">Sân vườn</option>
                <option value="indoor">Tầng 1 máy lạnh</option>
                <option value="vip">Phòng VIP</option>
                <option value="none">Chưa phân khu</option>
              </Select>
            </Field>
            <Field label="Ô bị khoá" htmlFor={`${areaId}-off`} hint="Chỉ chủ quán sửa được">
              <Input id={`${areaId}-off`} defaultValue="Bia lẩu Bảo Lương" disabled />
            </Field>
            <Field label="Ghi chú" htmlFor={noteId} className="md:col-span-2">
              <Textarea id={noteId} placeholder="Ví dụ: ít cay, mang rau ra trước" />
            </Field>
          </div>
        </Card>
      </Section>

      <Section title="Tab" description="Boxed cho trạng thái trên danh sách · Underline cho nội dung panel · Segmented để đổi cách xem.">
        <Card>
          <div className="space-y-5">
            <Tabs
              label="Lọc lượt gọi"
              value={statusTab}
              onValueChange={setStatusTab}
              items={[
                { value: 'all', label: 'Tất cả', count: 12 },
                { value: 'pending', label: 'Chờ duyệt', count: 3 },
                { value: 'done', label: 'Đã xong', count: 9 },
              ]}
            />
            <Tabs
              label="Chi tiết mâm"
              variant="underline"
              value={detailTab}
              onValueChange={setDetailTab}
              items={[
                { value: 'bill', label: 'Hoá đơn' },
                { value: 'rounds', label: 'Lượt gọi' },
                { value: 'history', label: 'Lịch sử' },
              ]}
            />
            <Tabs
              label="Cách xem bàn"
              variant="segmented"
              value={viewTab}
              onValueChange={setViewTab}
              items={[
                { value: 'timeline', label: 'Timeline' },
                { value: 'map', label: 'Sơ đồ bàn' },
              ]}
            />
          </div>
        </Card>
      </Section>

      <Section title="Card & danh sách" description="Card viền mảnh, không bóng. Danh sách chia bằng đường kẻ, không xếp chồng nhiều card nổi.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Hoá đơn mâm 09 + 10" description="Bill đã duyệt" action={<Button icon={<Printer />}>In tạm tính</Button>} flush>
            <ul className="divide-y divide-border">
              {SAMPLE_ROWS.map((row) => (
                <li key={row.name} className="flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-surface-hover">
                  <span className="w-8 shrink-0 text-sm text-muted tabular">×{row.qty}</span>
                  <span className="min-w-0 flex-1 text-sm text-foreground">{row.name}</span>
                  <span className="shrink-0 text-sm font-medium text-foreground tabular">{formatVND(row.price * row.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="mx-3 mt-2 flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-sm text-muted">Tổng thanh toán</span>
              <span className="text-xl font-semibold text-foreground tabular">{formatVND(123456789)}</span>
            </div>
          </Card>
          <Card title="Việc cần xử lý">
            <SkeletonList rows={3} label="Đang tải việc cần xử lý" />
          </Card>
        </div>
      </Section>

      <Section title="Rỗng · lỗi · đang tải">
        <div className="grid gap-4 md:grid-cols-3">
          <Card title="Rỗng">
            <EmptyState>Chưa có yêu cầu chờ xử lý.</EmptyState>
          </Card>
          <Card title="Rỗng do lọc">
            <EmptyState
              action={
                <button type="button" className="cursor-pointer font-medium text-foreground underline-offset-4 hover:underline">
                  Xoá lọc
                </button>
              }
            >
              Không có bàn nào ở khu Phòng VIP.
            </EmptyState>
          </Card>
          <Card title="Lỗi tải">
            <ErrorState title="Không tải được danh sách bàn" reason="Mất kết nối mạng" onRetry={fakeRetry} isRetrying={isRetrying} />
          </Card>
        </div>
        <Spinner label="Đang đồng bộ…" />
      </Section>

      <Section title="Banner" description="Tình trạng còn kéo dài. Lỗi không có nút đóng.">
        <div className="space-y-3">
          <Banner tone="info" title="Đang xem dữ liệu ca tối 17:00–23:30" onClose={() => undefined} />
          <Banner tone="warning" title="Còn 2 lượt món chờ duyệt" action={<Button className="min-h-9 md:min-h-9">Xem lượt chờ</Button>}>
            Duyệt hoặc từ chối hết trước khi chốt thu tiền mâm 09 + 10.
          </Banner>
          <Banner tone="error" title="Mất kết nối" action={<Button className="min-h-9 md:min-h-9">Thử lại</Button>}>
            Thao tác vừa rồi chưa được gửi. Giỏ món vẫn được giữ nguyên.
          </Banner>
        </div>
      </Section>

      <Section title="Lớp nổi" description="Hộp xác nhận ở giữa; panel chi tiết trượt từ phải (desktop) hoặc từ dưới (mobile).">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setIsConfirmOpen(true)}>Mở hộp xác nhận</Button>
          <Button onClick={() => setIsSideOpen(true)}>Mở panel chi tiết</Button>
        </div>
        <ToastTriggers />
      </Section>

      <Section title="Khung app" description="Sidebar 240px từ 1024px, thu gọn được; dưới 1024px là thanh trên + nút menu.">
        <div className="overflow-hidden rounded-xl border border-border">
          <AppShell
            className="h-[480px]"
            brand={{ title: 'Bia lẩu Bảo Lương — chi nhánh Hoàng Mai', subtitle: 'MEVO · Chủ quán' }}
            groups={[
              {
                items: [
                  { href: '/mevo/ui-kit', label: 'Điều hành', icon: <LayoutGrid />, count: 3 },
                  { href: '/mevo/ui-kit/menu', label: 'Thực đơn', icon: <UtensilsCrossed /> },
                  { href: '/mevo/ui-kit/reservations', label: 'Đặt bàn', icon: <CalendarDays /> },
                ],
              },
              {
                label: 'Quản lý',
                items: [
                  { href: '/mevo/ui-kit/staff', label: 'Nhân viên', icon: <Users /> },
                  { href: '/mevo/ui-kit/settings', label: 'Cấu hình', icon: <Settings /> },
                ],
              },
            ]}
            footer={
              <Button variant="ghost" icon={<LogOut />} className="w-full justify-start">
                Đăng xuất
              </Button>
            }
          >
            <div className="p-4 md:p-6">
              <PageHeader title="Điều hành" description="Vùng nội dung tự cuộn, sidebar đứng yên." />
            </div>
          </AppShell>
        </div>
      </Section>

      <Dialog
        open={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title="Bỏ món khỏi bill?"
        description="Lẩu riêu cua · ×1 · 450.000đ"
        dismissible={false}
        footer={
          <>
            <Button onClick={() => setIsConfirmOpen(false)}>Giữ lại</Button>
            <Button variant="danger" onClick={() => setIsConfirmOpen(false)}>
              Bỏ món
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">Món bị bỏ vẫn hiện trong lịch sử bill với nhãn &quot;Khách bỏ&quot;, có thể khôi phục.</p>
      </Dialog>

      <Dialog
        open={isSideOpen}
        onClose={() => setIsSideOpen(false)}
        placement="side"
        title="Mâm 09 + 10 (ghép 2 bàn)"
        description="Nguyễn Minh An · 09xx xxx 111 · 10 khách"
        footer={
          <>
            <Button onClick={() => setIsSideOpen(false)}>Đóng</Button>
            <Button variant="primary" icon={<Receipt />}>
              Thanh toán
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <TableStateBadge state="serving" />
            <Badge tone="warning">2 lượt chờ duyệt</Badge>
          </div>
          <ul className="divide-y divide-border">
            {[...SAMPLE_ROWS, ...SAMPLE_ROWS, ...SAMPLE_ROWS].map((row, index) => (
              <li key={`${row.name}-${index}`} className="flex items-start gap-3 py-3">
                <span className="w-8 shrink-0 text-sm text-muted tabular">×{row.qty}</span>
                <span className="min-w-0 flex-1 text-sm">{row.name}</span>
                <span className="shrink-0 text-sm font-medium tabular">{formatVND(row.price * row.qty)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Dialog>
    </div>
  )
}

export default function UiKitClient() {
  return (
    <ToastProvider>
      <div className="min-h-0 flex-1 overflow-y-auto bg-background">
        <UiKitBody />
      </div>
    </ToastProvider>
  )
}
