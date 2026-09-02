import { describe, expect, it } from 'vitest'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { pickPracticeExtraWordIds } from './practice-extra-words.ts'

function entry(lemma: string, pos: WordIndexEntry['pos'], rank: number): WordIndexEntry {
  return { lemma, pos, rank, level: 'A1', primaryRu: 'x', sensesShard: 0, paradigmShard: -1 }
}

describe('pickPracticeExtraWordIds', () => {
  it('samples only from words at or below the frequency ceiling (2000)', () => {
    __resetIndexStoreForTest()
    initIndexStore([
      entry('a', 'NOUN', 100),
      entry('b', 'VERB', 500),
      entry('c', 'ADJ', 2000),
      entry('d', 'ADV', 5000), // above the ceiling — never picked
    ])
    const result = pickPracticeExtraWordIds(10, 1)
    expect(result).toHaveLength(3)
    expect(result).not.toContain(encodeWordId('d', 'ADV'))
  })

  it('degrades to fewer ids when the pool is smaller than n (never fabricates)', () => {
    __resetIndexStoreForTest()
    initIndexStore([entry('a', 'NOUN', 1), entry('b', 'VERB', 2)])
    expect(pickPracticeExtraWordIds(8, 1)).toHaveLength(2)
  })

  it('is deterministic for a given seed', () => {
    __resetIndexStoreForTest()
    initIndexStore(
      Array.from({ length: 20 }, (_, i) => entry(`w${i}`, 'NOUN', i + 1)),
    )
    const a = pickPracticeExtraWordIds(5, 42)
    const b = pickPracticeExtraWordIds(5, 42)
    expect(a).toEqual(b)
  })

  it('different seeds can produce different samples', () => {
    __resetIndexStoreForTest()
    initIndexStore(
      Array.from({ length: 20 }, (_, i) => entry(`w${i}`, 'NOUN', i + 1)),
    )
    const a = pickPracticeExtraWordIds(5, 1)
    const b = pickPracticeExtraWordIds(5, 2)
    expect(a).not.toEqual(b)
  })
})
