import QRCode from 'qrcode'

// env=TESTING&version=N được thêm vào khi chạy Testing mode
// Khi publish Production thì để trống 2 biến này trên Vercel
const ZALO_ENV = process.env.NEXT_PUBLIC_ZALO_ENV ?? ''
const ZALO_VERSION = process.env.NEXT_PUBLIC_ZALO_VERSION ?? ''

export function buildTableQRUrl(
  zaloAppId: string,
  storeSlug: string,
  tableId: string
): string {
  const params = new URLSearchParams({ store: storeSlug, table: tableId })
  if (ZALO_ENV) params.set('env', ZALO_ENV)
  if (ZALO_VERSION) params.set('version', ZALO_VERSION)
  return `https://zalo.me/s/${zaloAppId}/?${params.toString()}`
}

export async function generateTableQR(
  zaloAppId: string,
  storeSlug: string,
  tableId: string
): Promise<string> {
  const url = buildTableQRUrl(zaloAppId, storeSlug, tableId)
  return QRCode.toDataURL(url, {
    width: 500,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  })
}
