'use client'

import { useSyncExternalStore } from 'react'

// Trình duyệt có mạng không (navigator.onLine + sự kiện online/offline). Server luôn coi là có mạng.
function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
