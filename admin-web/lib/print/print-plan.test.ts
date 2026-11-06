import { describe, expect, it } from 'vitest'
import { planDocumentJob, planOrderJobs } from './print-plan'
import type { PrintRequest } from './print-request'

const base = {
  request: { kind: 'order', orderId: 'o1' } as const,
  sourceKey: 'order:o1',
  posStationId: 'pos',
  defaultKitchenStationId: 'bep',
  stationNames: { pos: 'Quầy', bep: 'Bếp', nuong: 'Nướng' },
  tableLabel: 'Bàn 5',
  reprintToken: null,
}

describe('planOrderJobs', () => {
  it('món hai trạm: 2 phiếu bếp + 1 phiếu bàn ở Quầy', () => {
    const jobs = planOrderJobs({ ...base, items: [{ key: 'a', stationId: 'bep' }, { key: 'b', stationId: 'nuong' }] })
    expect(jobs.map((j) => [j.kind, j.stationId])).toEqual([
      ['kitchen_ticket', 'bep'],
      ['kitchen_ticket', 'nuong'],
      ['table_slip', 'pos'],
    ])
    expect(jobs[0].ref.itemKeys).toEqual(['a'])
    expect(jobs[1].ref.itemKeys).toEqual(['b'])
  })

  it('món một trạm: 1 phiếu bếp + 1 phiếu bàn', () => {
    const jobs = planOrderJobs({ ...base, items: [{ key: 'a', stationId: 'nuong' }, { key: 'b', stationId: 'nuong' }] })
    expect(jobs).toHaveLength(2)
    expect(jobs[0].ref.itemKeys).toEqual(['a', 'b'])
  })

  it('stationId null ra trạm mặc định', () => {
    const jobs = planOrderJobs({ ...base, items: [{ key: 'a', stationId: null }] })
    expect(jobs[0].kind).toBe('kitchen_ticket')
    expect(jobs[0].stationId).toBe('bep')
  })

  it('trạm Quầy có món: vẫn 2 phiếu ở Quầy, phiếu bếp và phiếu bàn', () => {
    const jobs = planOrderJobs({ ...base, items: [{ key: 'a', stationId: 'pos' }] })
    expect(jobs.map((j) => [j.kind, j.stationId])).toEqual([
      ['kitchen_ticket', 'pos'],
      ['table_slip', 'pos'],
    ])
    expect(new Set(jobs.map((j) => j.dedupeKey)).size).toBe(2)
  })

  it('khoá tự nhiên giống nhau giữa hai lần; reprintToken đổi khoá', () => {
    const items = [{ key: 'a', stationId: 'bep' }]
    const k1 = planOrderJobs({ ...base, items }).map((j) => j.dedupeKey)
    const k2 = planOrderJobs({ ...base, items }).map((j) => j.dedupeKey)
    expect(k1).toEqual(k2)
    expect(k1).toEqual(['order:o1:kitchen:bep', 'order:o1:table'])
    const k3 = planOrderJobs({ ...base, items, reprintToken: 'abc' }).map((j) => j.dedupeKey)
    expect(k3).toEqual(['order:o1:kitchen:bep:rabc', 'order:o1:table:rabc'])
  })

  it('ref có label và request; phiếu bếp có source, itemKeys; phiếu bàn có source', () => {
    const [bep, ban] = planOrderJobs({ ...base, items: [{ key: 'a', stationId: 'bep' }] })
    expect(bep.ref).toMatchObject({ label: 'Phiếu bếp · Bếp · Bàn 5', request: base.request, source: 'order:o1', itemKeys: ['a'] })
    expect(ban.ref).toMatchObject({ label: 'Phiếu bàn · Bàn 5', request: base.request, source: 'order:o1' })
  })

  it('đơn không còn món: chỉ trả [] để action báo lỗi', () => {
    expect(planOrderJobs({ ...base, items: [] })).toEqual([])
  })
})

describe('planDocumentJob', () => {
  it('hoá đơn ra Quầy, khoá theo token riêng mỗi lần', () => {
    const req: PrintRequest = { kind: 'bill', sessionIds: ['s1'] }
    const a = planDocumentJob(req, 'pos', 'Hoá đơn', 't1')
    const b = planDocumentJob(req, 'pos', 'Hoá đơn', 't2')
    expect(a).toMatchObject({ stationId: 'pos', kind: 'bill', ref: { label: 'Hoá đơn', request: req } })
    expect(a.dedupeKey).not.toBe(b.dedupeKey)
  })

  it('không dùng cho đơn', () => {
    expect(() => planDocumentJob({ kind: 'order', orderId: 'o' }, 'pos', 'x', 't')).toThrow()
  })
})
