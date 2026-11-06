import { readFileSync } from 'node:fs'
import type { PageSizeMode } from './slip-size'

export type AgentConfig = {
  supabaseUrl: string
  anonKey: string
  webOrigin: string
  pageSizeMode: PageSizeMode
}

function fail(field: string): never {
  throw new Error(`agent.config.json: thiếu hoặc sai trường ${field}`)
}

function readUrl(raw: Record<string, unknown>, field: string): string {
  const value = raw[field]
  if (typeof value !== 'string' || !/^https?:\/\/[^/]/.test(value)) fail(field)
  return value.replace(/\/+$/, '')
}

export function parseConfig(text: string): AgentConfig {
  const raw = JSON.parse(text) as Record<string, unknown>
  const { anonKey, pageSizeMode } = raw
  if (typeof anonKey !== 'string' || !anonKey) fail('anonKey')
  if (pageSizeMode !== 'measured' && pageSizeMode !== 'printer-default') fail('pageSizeMode')
  return {
    supabaseUrl: readUrl(raw, 'supabaseUrl'),
    anonKey,
    webOrigin: readUrl(raw, 'webOrigin'),
    pageSizeMode,
  }
}

export function loadConfig(filePath: string): AgentConfig {
  return parseConfig(readFileSync(filePath, 'utf8'))
}
