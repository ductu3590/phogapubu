'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Delete, Lock, LogOut } from 'lucide-react'
import { signOut } from '@/app/(auth)/login/actions'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  COOLDOWN_MS, EMPTY_STATE, MAX_FAILS, PIN_LENGTH, disabled, parseState, storageKey, verifyPin, withNewPin, writeState,
  type PinLockState,
} from '@/lib/pos-lock'

// Khoá màn hình POS bằng mã PIN (2026-10-13). Phần lưu trữ + kiểm mã ở lib/pos-lock.ts.
// Provider đặt ở layout /admin nên lớp khoá đè lên MỌI trang khu chủ quán (POS, hộp thoại cấu hình, Bếp…),
// không chỉ POS — khoá xong mà bấm sang tab khác được thì khoá vô nghĩa.

function store() {
  try { return window.localStorage } catch { return null }
}

const listeners = new Set<() => void>()
function emit() { listeners.forEach((l) => l()) }
function subscribe(cb: () => void) {
  listeners.add(cb)
  // Tab khác cùng máy khoá / mở → tab này theo luôn.
  window.addEventListener('storage', cb)
  return () => { listeners.delete(cb); window.removeEventListener('storage', cb) }
}

type PosLockApi = {
  state: PinLockState
  lock: () => void
  setPin: (pin: string, lockNow: boolean) => void
  disable: () => void
  unlock: (pin: string) => boolean
  forget: () => void
}

const PosLockContext = createContext<PosLockApi | null>(null)

export function usePosLock(): PosLockApi {
  const ctx = useContext(PosLockContext)
  if (!ctx) throw new Error('usePosLock phải nằm trong <PosLockProvider>')
  return ctx
}

export function PosLockProvider({ userId, userLabel, children }: { userId: string; userLabel?: string | null; children: ReactNode }) {
  // Snapshot là CHUỖI thô (so sánh được bằng ===) rồi mới parse — trả object mới mỗi lần sẽ vẽ lại vô hạn.
  const raw = useSyncExternalStore(
    subscribe,
    () => { try { return store()?.getItem(storageKey(userId)) ?? null } catch { return null } },
    () => null,
  )
  const state = useMemo(() => (userId ? parseState(raw) : EMPTY_STATE), [raw, userId])

  const save = useCallback((next: PinLockState) => { writeState(store(), userId, next); emit() }, [userId])

  const api = useMemo<PosLockApi>(() => ({
    state,
    lock: () => { if (state.status === 'on') save({ ...state, locked: true }) },
    setPin: (pin, lockNow) => save(withNewPin(pin, lockNow)),
    disable: () => save(disabled()),
    unlock: (pin) => {
      if (!verifyPin(state, pin)) return false
      save({ ...state, locked: false })
      return true
    },
    // Quên mã: xoá hẳn để đăng nhập lại bằng mật khẩu xong không bị khoá bằng mã không ai nhớ.
    // Ghi THẲNG storage, không emit: emit là màn khoá biến mất ngay, lộ POS trong lúc chờ đăng xuất.
    forget: () => writeState(store(), userId, EMPTY_STATE),
  }), [state, save, userId])

  return (
    <PosLockContext.Provider value={api}>
      {children}
      {state.locked && <LockScreen userLabel={userLabel ?? null} />}
    </PosLockContext.Provider>
  )
}

/* ---------------- Bàn phím số ---------------- */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const

function PinPad({ value, onChange, disabled: off = false, error = false }: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  error?: boolean
}) {
  const press = useCallback((k: string) => {
    if (off) return
    if (k === 'del') onChange(value.slice(0, -1))
    else if (value.length < PIN_LENGTH) onChange(value + k)
  }, [off, onChange, value])

  // Máy quầy có bàn phím thật: gõ số / Backspace cũng được.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key) }
      else if (e.key === 'Backspace') { e.preventDefault(); press('del') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press])

  return (
    <div className="flex flex-col items-center gap-5">
      <div className={cn('flex gap-4', error && 'animate-[pin-shake_0.3s]')} aria-label={`Đã nhập ${value.length}/${PIN_LENGTH} số`} role="status">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            className={cn(
              'size-4 rounded-full border-2 transition-colors',
              error ? 'border-red-500 bg-red-500' : i < value.length ? 'border-orange-600 bg-orange-600' : 'border-slate-300 bg-transparent',
            )}
            aria-hidden
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k, i) => k === '' ? <span key={i} /> : (
          <button
            key={i}
            type="button"
            disabled={off}
            onClick={() => press(k)}
            aria-label={k === 'del' ? 'Xoá số vừa nhập' : k}
            className="grid size-16 place-items-center rounded-full border border-slate-200 bg-white text-2xl font-semibold text-slate-900 tabular transition-colors hover:bg-slate-100 active:bg-slate-200 disabled:opacity-40"
          >
            {k === 'del' ? <Delete className="size-6" aria-hidden /> : k}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Đặt / đổi mã (nhập 2 lần) ---------------- */

export function PinSetupDialog({ open, onClose, lockAfter, onDone }: {
  open: boolean
  onClose: () => void
  /** true = khoá màn hình ngay sau khi đặt (bấm nút khoá lần đầu trên POS). */
  lockAfter: boolean
  onDone?: () => void
}) {
  const { setPin } = usePosLock()
  const [first, setFirst] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const reset = () => { setFirst(null); setValue(''); setError('') }
  const close = () => { reset(); onClose() }

  const onChange = (v: string) => {
    setError('')
    setValue(v)
    if (v.length < PIN_LENGTH) return
    if (first === null) {
      setFirst(v)
      setValue('')
      return
    }
    if (v !== first) {
      // Lệch thì làm lại từ đầu — không biết lần nào gõ nhầm.
      setFirst(null)
      setValue('')
      setError('Hai lần nhập không khớp. Nhập lại mã mới.')
      return
    }
    setPin(v, lockAfter)
    reset()
    onDone?.()
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={false}
      title={first === null ? 'Đặt mã PIN khoá màn hình' : 'Nhập lại mã PIN để xác nhận'}
      description={first === null ? `Chọn ${PIN_LENGTH} chữ số dễ nhớ — dùng để mở khoá máy này.` : 'Gõ lại đúng mã vừa chọn.'}
    >
      <div className="flex flex-col items-center gap-4 py-2">
        {/* Chỉ gắn bàn phím khi đang mở: <Dialog> giữ con khi đóng, mà PinPad nghe phím số trên CẢ cửa sổ
            → để sẵn là nuốt mất chữ số gõ vào ô tiền khách đưa / ô tìm món trên POS.
            key: dựng lại khi sang bước 2 để chấm tròn về rỗng ngay. */}
        {open && <PinPad key={first === null ? 'a' : 'b'} value={value} onChange={onChange} error={!!error} />}
        <p className={cn('min-h-5 text-sm', error ? 'text-red-600' : 'text-slate-500')} role={error ? 'alert' : undefined}>
          {error || (first === null ? 'Bước 1/2' : 'Bước 2/2')}
        </p>
      </div>
    </Dialog>
  )
}

/* ---------------- Nút khoá trên thanh POS ---------------- */

export function PosLockButton() {
  const { state, lock } = usePosLock()
  const [setupOpen, setSetupOpen] = useState(false)
  // Đã tắt ở Bảo mật → ẩn hẳn nút.
  if (state.status === 'off') return null
  return (
    <>
      <IconButton
        icon={<Lock />}
        label={state.status === 'on' ? 'Khoá màn hình' : 'Đặt mã PIN và khoá màn hình'}
        onClick={() => (state.status === 'on' ? lock() : setSetupOpen(true))}
      />
      <PinSetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} lockAfter />
    </>
  )
}

/* ---------------- Mục "Khoá màn hình" ở trang Bảo mật ---------------- */

export function PosLockSettings() {
  const { state, disable } = usePosLock()
  const [setupOpen, setSetupOpen] = useState(false)
  const [saved, setSaved] = useState('')
  const on = state.status === 'on'

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(''), 2500)
    return () => clearTimeout(t)
  }, [saved])

  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-foreground">Khoá màn hình POS</h2>
      <label className="mt-4 flex cursor-pointer items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">Khoá bằng mã PIN {PIN_LENGTH} số</span>
          <span className="mt-0.5 block text-[13px] text-muted">
            Bấm nút <Lock className="inline size-3.5 align-[-2px]" aria-hidden /> cạnh nút loa trên POS để khoá khi rời quầy. Áp dụng cho tài khoản này trên máy này.
          </span>
        </span>
        <Switch
          checked={on}
          onChange={(e) => {
            if (e.target.checked) setSetupOpen(true)
            else { disable(); setSaved('Đã tắt khoá màn hình') }
          }}
        />
      </label>
      <div className="mt-auto flex items-center gap-3 pt-5">
        {on && <Button onClick={() => setSetupOpen(true)}>Đổi mã PIN</Button>}
        {saved && <span className="text-sm text-success">{saved}</span>}
      </div>
      <PinSetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} lockAfter={false} onDone={() => setSaved('Đã lưu mã PIN')} />
    </div>
  )
}

/* ---------------- Màn khoá ---------------- */

function LockScreen({ userLabel }: { userLabel: string | null }) {
  const { unlock, forget } = usePosLock()
  const ref = useRef<HTMLDialogElement>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [fails, setFails] = useState(0)
  const [blockedUntil, setBlockedUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [confirmForget, setConfirmForget] = useState(false)

  // <dialog> showModal nằm ở "top layer": đè cả các hộp thoại POS đang mở và làm phần còn lại trơ (không bấm được).
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  // Chrome cho phép Esc liên tiếp đóng <dialog> dù đã preventDefault → đóng thì mở lại ngay.
  const reopen = () => { const d = ref.current; if (d && !d.open) d.showModal() }

  useEffect(() => {
    if (blockedUntil <= Date.now()) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [blockedUntil])

  const blocked = blockedUntil > now
  const secondsLeft = Math.ceil((blockedUntil - now) / 1000)

  const onChange = (v: string) => {
    setError(false)
    setValue(v)
    if (v.length < PIN_LENGTH) return
    if (unlock(v)) return
    const n = fails + 1
    setValue('')
    setError(true)
    if (n >= MAX_FAILS) {
      setFails(0)
      const until = Date.now() + COOLDOWN_MS
      setBlockedUntil(until)
      setNow(Date.now())
    } else {
      setFails(n)
    }
  }

  return (
    <dialog
      ref={ref}
      aria-label="Màn hình POS đang khoá"
      onCancel={(e) => e.preventDefault()}
      onClose={reopen}
      // Nền = chính màn POS phía sau làm mờ (::backdrop), mờ đủ để không đọc được bill / số tiền.
      // Chữ + bàn phím nằm trong thẻ trắng → đọc rõ bất kể phía sau sáng hay tối.
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-transparent p-0 text-slate-900 backdrop:bg-slate-900/25 backdrop:backdrop-blur-xl open:flex"
    >
      <div className="m-auto w-full max-w-sm px-4 py-8">
        <div className="flex flex-col items-center gap-5 rounded-3xl border border-slate-200 bg-white/95 px-6 py-7 shadow-modal">
          <span className="grid size-14 place-items-center rounded-full bg-orange-600 text-white [&>svg]:size-7" aria-hidden><Lock /></span>
          <div className="text-center">
            <h2 className="text-xl font-bold">Màn hình POS đang khoá</h2>
            <p className="mt-1 text-sm text-slate-500">{userLabel ? `${userLabel} · ` : ''}Nhập mã PIN để mở</p>
          </div>
          <PinPad value={value} onChange={onChange} disabled={blocked} error={error} />
          <p className="min-h-5 text-center text-sm font-medium text-red-600" role="alert">
            {blocked
              ? `Sai quá ${MAX_FAILS} lần. Thử lại sau ${secondsLeft} giây.`
              : error ? `Sai mã PIN${fails > 0 ? ` (còn ${MAX_FAILS - fails} lần)` : ''}` : ''}
          </p>
          {confirmForget ? (
            <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="text-slate-700">Đăng xuất rồi đăng nhập lại bằng mật khẩu để mở máy. Mã PIN cũ sẽ bị xoá, lần sau bấm khoá sẽ đặt mã mới.</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmForget(false)} className="min-h-10 rounded-lg px-4 font-medium text-slate-600 hover:bg-slate-200">Huỷ</button>
                <form action={signOut} onSubmit={() => forget()}>
                  <button type="submit" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 font-semibold text-white hover:bg-slate-800">
                    <LogOut className="size-4" aria-hidden />Đăng xuất
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmForget(true)} className="text-sm text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline">
              Quên mã PIN?
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}
