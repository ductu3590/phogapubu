import type { WebContentsPrintOptions } from 'electron'

export type PageSizeMode = 'measured' | 'printer-default'

const MICRONS_PER_INCH = 25400
const CSS_PX_PER_INCH = 96
// Giấy nhiệt 80mm
const PAPER_WIDTH_MICRONS = 80000
// Lề đáy 5mm để dao cắt không xén mất dòng cuối
const BOTTOM_MARGIN_MICRONS = 5000

/** Đổi px CSS sang micron, cộng lề đáy 5mm. */
export function pxToMicrons(px: number): number {
  return Math.ceil((px * MICRONS_PER_INCH) / CSS_PX_PER_INCH) + BOTTOM_MARGIN_MICRONS
}

export function buildPrintOptions(input: {
  deviceName: string
  mode: PageSizeMode
  contentHeightPx: number
}): WebContentsPrintOptions {
  const base: WebContentsPrintOptions = {
    silent: true,
    printBackground: true,
    deviceName: input.deviceName,
    margins: { marginType: 'none' },
  }
  if (input.mode === 'printer-default') {
    // Để driver máy in tự quyết khổ giấy (thường là cuộn liên tục)
    return { ...base, usePrinterDefaultPageSize: true }
  }
  // Đo chiều cao nội dung rồi ép khổ 80mm x (cao nội dung)
  return {
    ...base,
    pageSize: { width: PAPER_WIDTH_MICRONS, height: pxToMicrons(input.contentHeightPx) },
  }
}
