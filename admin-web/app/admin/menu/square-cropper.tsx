'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

const VIEWPORT = 260 // kích thước khung crop hiển thị (px)
const OUTPUT = 800 // kích thước ảnh xuất ra (px, vuông 1:1)

// Cropper vuông tự chứa: chọn ảnh → kéo để di chuyển + thanh kéo để phóng to →
// xuất file JPEG 1:1 800x800. Không phụ thuộc thư viện ngoài.
export default function SquareCropper({
  initialUrl,
  onChange,
}: {
  initialUrl?: string | null
  onChange: (file: File | null) => void
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [minScale, setMinScale] = useState(1)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Giới hạn offset để ảnh luôn phủ kín khung (không lòi nền trống)
  const clamp = useCallback(
    (o: { x: number; y: number }, s: number, image: HTMLImageElement) => {
      const maxX = Math.max(0, (image.width * s) / 2 - VIEWPORT / 2)
      const maxY = Math.max(0, (image.height * s) / 2 - VIEWPORT / 2)
      return {
        x: Math.min(maxX, Math.max(-maxX, o.x)),
        y: Math.min(maxY, Math.max(-maxY, o.y)),
      }
    },
    [],
  )

  const handleFile = (file: File) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const ms = VIEWPORT / Math.min(image.width, image.height) // phủ kín khung
      setImg(image)
      setMinScale(ms)
      setScale(ms)
      setOffset({ x: 0, y: 0 })
      URL.revokeObjectURL(url)
    }
    image.src = url
  }

  // Vẽ khung preview mỗi khi ảnh/scale/offset đổi
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, VIEWPORT, VIEWPORT)
    const w = img.width * scale
    const h = img.height * scale
    const dx = VIEWPORT / 2 - w / 2 + offset.x
    const dy = VIEWPORT / 2 - h / 2 + offset.y
    ctx.drawImage(img, dx, dy, w, h)
  }, [img, scale, offset])

  // Xuất file ảnh đã crop (debounce nhẹ) mỗi khi ảnh/scale/offset đổi
  useEffect(() => {
    if (!img) return
    const t = setTimeout(() => {
      const out = document.createElement('canvas')
      out.width = OUTPUT
      out.height = OUTPUT
      const ctx = out.getContext('2d')
      if (!ctx) return
      const f = OUTPUT / VIEWPORT
      const w = img.width * scale * f
      const h = img.height * scale * f
      const dx = OUTPUT / 2 - w / 2 + offset.x * f
      const dy = OUTPUT / 2 - h / 2 + offset.y * f
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, OUTPUT, OUTPUT)
      ctx.drawImage(img, dx, dy, w, h)
      out.toBlob(
        (blob) => {
          if (blob) onChange(new File([blob], 'menu.jpg', { type: 'image/jpeg' }))
        },
        'image/jpeg',
        0.85,
      )
    }, 120)
    return () => clearTimeout(t)
  }, [img, scale, offset, onChange])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !img) return
    const next = {
      x: drag.current.ox + (e.clientX - drag.current.px),
      y: drag.current.oy + (e.clientY - drag.current.py),
    }
    setOffset(clamp(next, scale, img))
  }
  const onPointerUp = () => {
    drag.current = null
  }

  const onZoom = (val: number) => {
    if (!img) return
    setScale(val)
    setOffset((o) => clamp(o, val, img))
  }

  const clearImg = () => {
    setImg(null)
    onChange(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="flex flex-col gap-2">
      {!img ? (
        <div className="flex flex-col items-center gap-2">
          {initialUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={initialUrl}
              alt="Ảnh hiện tại"
              className="h-24 w-24 rounded-xl border border-gray-200 object-cover"
            />
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 hover:border-orange-400 hover:text-orange-500"
          >
            {initialUrl ? '🖼️ Đổi ảnh món' : '🖼️ Chọn ảnh món (sẽ cắt vuông)'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div
            className="relative cursor-move touch-none overflow-hidden rounded-xl bg-gray-100"
            style={{ width: VIEWPORT, height: VIEWPORT }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas ref={canvasRef} width={VIEWPORT} height={VIEWPORT} />
            {/* viền hướng dẫn vùng vuông */}
            <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-white/70" />
          </div>
          <input
            type="range"
            min={minScale}
            max={minScale * 3}
            step={minScale / 50}
            value={scale}
            onChange={(e) => onZoom(parseFloat(e.target.value))}
            className="w-full max-w-[260px] accent-orange-500"
          />
          <div className="flex gap-3 text-xs">
            <span className="text-gray-400">Kéo để chỉnh • thanh trượt để phóng to</span>
            <button type="button" onClick={clearImg} className="text-red-500 hover:underline">
              Bỏ ảnh
            </button>
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />
    </div>
  )
}
