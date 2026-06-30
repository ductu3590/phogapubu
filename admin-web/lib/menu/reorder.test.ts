import { describe, expect, it } from 'vitest'
import { buildSortUpdates, uniqueOrderedIds } from './reorder'

describe('menu reorder helpers', () => {
  it('keeps the first occurrence of each non-empty id', () => {
    expect(uniqueOrderedIds(['cat-1', '', 'cat-2', 'cat-1', '  ', 'cat-3'])).toEqual([
      'cat-1',
      'cat-2',
      'cat-3',
    ])
  })

  it('builds deterministic sort_order updates from ordered ids', () => {
    expect(buildSortUpdates(['item-c', 'item-a', 'item-b'])).toEqual([
      { id: 'item-c', sort_order: 0 },
      { id: 'item-a', sort_order: 1 },
      { id: 'item-b', sort_order: 2 },
    ])
  })
})
