import { describe, expect, it } from 'vitest'
import { POS_VIEW_KEY, POS_VIEW_LABEL, createForcedViewMemory, readDefaultView, writeDefaultView } from './pos-view-pref'

describe('readDefaultView', () => {
  it('chưa ghim → timeline', () => expect(readDefaultView({ getItem: () => null })).toBe('timeline'))
  it('đọc floor', () => expect(readDefaultView({ getItem: () => 'floor' })).toBe('floor'))
  it('list hoặc giá trị lạ → timeline', () => {
    expect(readDefaultView({ getItem: () => 'list' })).toBe('timeline')
    expect(readDefaultView({ getItem: () => 'grid' })).toBe('timeline')
  })
  it('getItem ném lỗi / storage undefined → timeline', () => {
    expect(readDefaultView({ getItem: () => { throw new Error('denied') } })).toBe('timeline')
    expect(readDefaultView(undefined)).toBe('timeline')
  })
})

describe('writeDefaultView', () => {
  it('ghi khoá mevo:pos-view và trả true', () => {
    const calls: string[][] = []
    expect(writeDefaultView({ setItem: (k, v) => { calls.push([k, v]) } }, 'floor')).toBe(true)
    expect(calls).toEqual([['mevo:pos-view', 'floor']])
    expect(POS_VIEW_KEY).toBe('mevo:pos-view')
  })
  it('setItem ném lỗi / storage undefined → false', () => {
    expect(writeDefaultView({ setItem: () => { throw new Error('full') } }, 'floor')).toBe(false)
    expect(writeDefaultView(undefined, 'floor')).toBe(false)
  })
})

describe('POS_VIEW_LABEL', () => {
  it('nhãn tab', () => {
    expect(POS_VIEW_LABEL.floor).toBe('Sơ đồ')
    expect(POS_VIEW_LABEL.timeline).toBe('Timeline')
    expect(POS_VIEW_LABEL.list).toBe('Danh sách')
  })
})

describe('createForcedViewMemory (tab trước khi hệ thống ép)', () => {
  it('remember giữ tab ĐẦU TIÊN, take trả về rồi xoá', () => {
    const m = createForcedViewMemory()
    m.remember('timeline')
    m.remember('floor') // ép lần hai không đè tab gốc
    expect(m.take()).toBe('timeline')
    expect(m.take()).toBeNull()
  })
  it('clear (bấm tab / rời POS) → take không trả tab cũ', () => {
    const m = createForcedViewMemory()
    m.remember('list')
    m.clear()
    expect(m.take()).toBeNull()
    m.remember('timeline')
    expect(m.take()).toBe('timeline')
  })
})
