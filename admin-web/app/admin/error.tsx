'use client'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-4xl">⚠️</div>
      <h2 className="text-xl font-bold text-gray-900">Lỗi tải trang</h2>
      <pre className="max-w-2xl overflow-auto rounded-xl bg-red-50 p-4 text-left text-xs text-red-700">
        {error.message}
        {'\n\n'}
        {error.stack}
      </pre>
      <p className="text-sm text-gray-500">digest: {error.digest}</p>
      <button
        onClick={reset}
        className="rounded-xl bg-orange-500 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-600"
      >
        Thử lại
      </button>
    </div>
  )
}
