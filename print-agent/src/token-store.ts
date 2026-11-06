import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
}

export function createTokenStore(dir: string, safe: SafeStorageLike) {
  const file = join(dir, 'agent-token.bin')
  return {
    load(): string | null {
      try {
        return safe.decryptString(readFileSync(file)) || null
      } catch {
        // Chưa có file, file hỏng, hoặc mã hoá bởi user Windows khác: đều phải ghép lại
        return null
      }
    },
    save(token: string): void {
      if (!safe.isEncryptionAvailable()) throw new Error('Máy này không mã hoá được token')
      writeFileSync(file, safe.encryptString(token))
    },
    clear(): void {
      rmSync(file, { force: true })
    },
  }
}
