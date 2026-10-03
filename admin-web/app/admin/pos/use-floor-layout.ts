'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { loadFloorLayout, saveFloorLayout } from '@/lib/actions/floor-layout'
import { layoutByArea, moveInArea, transferToArea, type FloorDraft, type FloorSnapshot } from '@/lib/area-layout'

const toDraft = (snapshot: FloorSnapshot): FloorDraft => ({ ...snapshot, tables: layoutByArea(snapshot.tables) })
const firstArea = (snapshot: FloorSnapshot | null) => snapshot?.tables.some(t => !t.area_id) ? null : snapshot?.areas[0]?.id ?? null

export function useFloorLayout(storeId: string, initial: FloorSnapshot | null, initialError: string | null) {
  const [draft, setDraft] = useState<FloorDraft>(() => initial ? toDraft(initial) : { version: 0, areas: [], tables: [] })
  const [arrange, setArrange] = useState(false)
  const [saving, setSaving] = useState(false)
  const [areaId, setAreaId] = useState<string | null>(() => firstArea(initial))
  const [error, setError] = useState(initialError)
  const [notice, setNotice] = useState<string | null>(null)
  const [ready, setReady] = useState(initial !== null)
  const saved = useRef(initial)
  const editing = useRef(false)
  const locked = useRef(false)
  const request = useRef(0)

  const accept = useCallback((snapshot: FloorSnapshot) => {
    saved.current = snapshot
    setDraft(toDraft(snapshot))
    setReady(true)
    setAreaId(id => id === null || snapshot.areas.some(a => a.id === id) ? id : firstArea(snapshot))
    setError(null)
  }, [])

  const refresh = useCallback(async () => {
    const ticket = ++request.current
    const result = await loadFloorLayout()
    if (ticket !== request.current || locked.current) return
    if (!result.ok) { setError(result.error); return }
    if (editing.current) {
      if (JSON.stringify(result.snapshot) !== JSON.stringify(saved.current)) {
        setNotice('Sơ đồ hoặc danh sách bàn đã thay đổi trên máy khác. Hủy chỉnh sửa để tải bản mới.')
      }
      return // Sự kiện realtime không được ghi đè bản nháp đang kéo.
    }
    accept(result.snapshot)
  }, [accept])

  useEffect(() => {
    const client = createClient()
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void refresh(), 150) }
    const channel = client.channel(`floor-layout-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores', filter: `id=eq.${storeId}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `store_id=eq.${storeId}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_areas', filter: `store_id=eq.${storeId}` }, schedule)
      .subscribe(status => { if (status === 'SUBSCRIBED') schedule() })
    const focus = () => void refresh()
    const invalidateRequests = () => { ++request.current }
    window.addEventListener('focus', focus)
    return () => {
      invalidateRequests()
      clearTimeout(timer)
      window.removeEventListener('focus', focus)
      void client.removeChannel(channel)
    }
  }, [storeId, refresh])

  useEffect(() => {
    if (!arrange) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [arrange])

  const begin = async () => {
    if (locked.current) return
    locked.current = true
    ++request.current
    setSaving(true)
    try {
      const result = await loadFloorLayout()
      if (!result.ok) { setError(result.error); return }
      accept(result.snapshot)
      editing.current = true
      setArrange(true)
      setNotice(null)
    } finally { locked.current = false; setSaving(false) }
  }

  const cancel = () => {
    if (locked.current) return
    ++request.current
    editing.current = false
    setArrange(false)
    setNotice(null)
    if (saved.current) accept(saved.current)
    void refresh()
  }

  const save = async () => {
    if (locked.current || !editing.current) return
    locked.current = true
    ++request.current
    setSaving(true)
    setError(null)
    try {
      const result = await saveFloorLayout({
        version: draft.version,
        areas: draft.areas,
        tables: draft.tables.map(t => ({ ...t, pos_x: t.x, pos_y: t.y })),
      })
      if (!result.ok) { setError(result.error); return }
      ++request.current
      accept(result.snapshot)
      editing.current = false
      setArrange(false)
      setNotice('Đã lưu sơ đồ.')
    } finally { locked.current = false; setSaving(false) }
  }

  const rename = (id: string | null, name: string): boolean => {
    if (locked.current || !editing.current) return false
    const clean = name.trim()
    if (!clean || clean.length > 60 || draft.areas.some(a => a.id !== id && a.name.toLocaleLowerCase('vi') === clean.toLocaleLowerCase('vi'))) {
      setError('Tên khu vực phải có 1–60 ký tự và không trùng nhau.')
      return false
    }
    if (!id && draft.areas.length >= 100) { setError('Tối đa 100 khu vực.'); return false }
    const nextId = id ?? crypto.randomUUID()
    setDraft(prev => ({ ...prev, areas: id ? prev.areas.map(a => a.id === id ? { ...a, name: clean } : a) : [...prev.areas, { id: nextId, name: clean }] }))
    setAreaId(nextId)
    setError(null)
    return true
  }

  return {
    draft, arrange, saving, ready, areaId, setAreaId, error, notice, begin, cancel, save, refresh, rename,
    move: (id: string, x: number, y: number) => {
      if (locked.current || !editing.current || y > 199) return
      setDraft(prev => ({ ...prev, tables: moveInArea(prev.tables, id, x, y) }))
    },
    transfer: (id: string, destination: string | null) => {
      if (locked.current || !editing.current) return
      setDraft(prev => ({ ...prev, tables: transferToArea(prev.tables, id, destination) }))
    },
  }
}

export type FloorController = ReturnType<typeof useFloorLayout>
