'use client'

import { useEffect } from 'react'
import { setBellStyle } from '@/lib/bell'
import { parseBellStyle } from '@/lib/bell-settings'

// Đưa kiểu chuông của quán (stores.bell_style) vào lib/bell — đặt một lần ở layout, mọi chỗ gọi
// playBell() trong khu đó tự kêu đúng kiểu. Không vẽ gì.
export default function BellStyleSync({ style }: { style: string | null | undefined }) {
  useEffect(() => { setBellStyle(parseBellStyle(style)) }, [style])
  return null
}
