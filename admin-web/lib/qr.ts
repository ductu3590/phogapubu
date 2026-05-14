import QRCode from 'qrcode'

export async function generateTableQR(
  zaloAppId: string,
  storeSlug: string,
  tableId: string
): Promise<string> {
  // URL Zalo Mini App nhận khi khách quét QR trên bàn
  const url = `https://zalo.me/s/${zaloAppId}/?store=${storeSlug}&table=${tableId}`

  return QRCode.toDataURL(url, {
    width: 500,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  })
}

export function buildTableQRUrl(
  zaloAppId: string,
  storeSlug: string,
  tableId: string
): string {
  return `https://zalo.me/s/${zaloAppId}/?store=${storeSlug}&table=${tableId}`
}
