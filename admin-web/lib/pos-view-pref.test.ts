import { describe, expect, it } from 'vitest'
import { POS_VIEW_KEY, POS_VIEW_LABEL, readDefaultView, writeDefaultView } from './pos-view-pref'

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
