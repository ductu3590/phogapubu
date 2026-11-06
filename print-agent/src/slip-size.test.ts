import { describe, it, expect } from 'vitest'
import { pxToMicrons, buildPrintOptions } from './slip-size'

describe('slip-size', () => {
  it('302px = 80mm cộng lề đáy 5mm', () =>
    expect(pxToMicrons(302)).toBe(Math.ceil((302 * 25400) / 96) + 5000))

  it('measured: rộng 80000, cao theo nội dung, lề none, silent', () => {
    const o = buildPrintOptions({ deviceName: 'XP', mode: 'measured', contentHeightPx: 400 })
    expect(o).toMatchObject({
      silent: true,
      printBackground: true,
      deviceName: 'XP',
      margins: { marginType: 'none' },
      pageSize: { width: 80000, height: pxToMicrons(400) },
    })
    expect(o.usePrinterDefaultPageSize).toBeUndefined()
  })

  it('printer-default: bật usePrinterDefaultPageSize và không có pageSize', () => {
    const o = buildPrintOptions({ deviceName: 'XP', mode: 'printer-default', contentHeightPx: 400 })
    expect(o.usePrinterDefaultPageSize).toBe(true)
    expect(o.pageSize).toBeUndefined()
  })
})
