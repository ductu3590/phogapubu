export type SortUpdate = {
  id: string
  sort_order: number
}

export function uniqueOrderedIds(ids: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const id of ids) {
    if (!id || id.trim() === '' || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }

  return result
}

export function buildSortUpdates(ids: string[]): SortUpdate[] {
  return uniqueOrderedIds(ids).map((id, index) => ({ id, sort_order: index }))
}
