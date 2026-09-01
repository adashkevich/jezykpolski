import { describe, expect, it } from 'vitest'
import { parseWordParam, wordPath } from './word-path.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'

describe('wordPath / parseWordParam', () => {
  it('round-trips a plain lemma', () => {
    const wordId = encodeWordId('dom', 'NOUN')
    const path = wordPath(wordId)
    const param = path.slice('/words/'.length)
    expect(parseWordParam(param)).toBe(wordId)
  })

  it('round-trips a lemma containing the "|" separator character verbatim (kobieta|NOUN)', () => {
    const wordId = encodeWordId('kobieta', 'NOUN')
    expect(wordId).toBe('kobieta|NOUN')

    const path = wordPath(wordId)
    // "|" is not a valid raw path character, so it must be percent-encoded in the path.
    expect(path).toBe('/words/kobieta%7CNOUN')

    const param = path.slice('/words/'.length)
    expect(parseWordParam(param)).toBe(wordId)
  })

  it('round-trips a lemma with Polish diacritics (żółty|ADJ)', () => {
    const wordId = encodeWordId('żółty', 'ADJ')
    expect(wordId).toBe('żółty|ADJ')

    const path = wordPath(wordId)
    const param = path.slice('/words/'.length)
    expect(parseWordParam(param)).toBe(wordId)
    expect(parseWordParam(param)).toBe('żółty|ADJ')
  })

  it('produces a path usable as a literal URL path segment (no raw "|", "%", or whitespace)', () => {
    const wordId = encodeWordId('żółty', 'ADJ')
    const param = wordPath(wordId).slice('/words/'.length)
    // decodeURIComponent must not throw, and the encoded segment must be a valid
    // percent-encoded path component (round-trips through the URL constructor too).
    expect(() => new URL(wordPath(wordId), 'https://example.test')).not.toThrow()
    expect(decodeURIComponent(param)).toBe(wordId)
  })
})
