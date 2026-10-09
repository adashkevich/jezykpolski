import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createParadigmResolver, PARADIGM_OVERRIDES } from './paradigm-aliases.ts'

/** The real, committed rename map of task 46 (37 entries). */
const { renames } = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'data', 'word-id-renames.json'), 'utf8'),
) as { renames: Record<string, string> }

/** Keys of `data/inflections.json` that matter here — the real file is keyed by v1 wordIds. */
const PARADIGM_IDS = new Set([
  'spocić|VERB',
  'czepiać|VERB',
  'wpatrować|VERB',
  'wpatrywać|VERB',
  'piast|NOUN',
  'to|NOUN',
  'co|NOUN',
  'gdy|ADV',
  'dzięki|NOUN',
  'kobieta|NOUN',
  'wieczór|NOUN',
  'wieczor|NOUN',
])

const resolve = createParadigmResolver(PARADIGM_IDS, renames)

describe('createParadigmResolver (real word-id-renames.json)', () => {
  it('a word whose wordId did not change uses its own paradigm', () => {
    expect(resolve('kobieta|NOUN', 'NOUN')).toEqual({ paradigmId: 'kobieta|NOUN', via: 'direct' })
  })

  it('a reflexive verb renamed in v2 uses the paradigm of its v1 wordId (без się)', () => {
    expect(resolve('spocić się|VERB', 'VERB')).toEqual({
      paradigmId: 'spocić|VERB',
      via: 'rename',
    })
    expect(resolve('czepiać się|VERB', 'VERB')).toEqual({
      paradigmId: 'czepiać|VERB',
      via: 'rename',
    })
  })

  it('wpatrywać się uses wpatrywać, not the v1 wpatrować the rename map points back to', () => {
    expect(renames['wpatrować|VERB']).toBe('wpatrywać się|VERB')
    expect(resolve('wpatrywać się|VERB', 'VERB')).toEqual({
      paradigmId: 'wpatrywać|VERB',
      via: 'override',
    })
  })

  it('piasta has no paradigm: the v1 piast is a Gen.pl form, not its lemma', () => {
    expect(renames['piast|NOUN']).toBe('piasta|NOUN')
    expect(resolve('piasta|NOUN', 'NOUN')).toEqual({ paradigmId: null, via: 'override' })
  })

  it('PRON / SCONJ / INTJ words have no paradigm, although their v1 "noun paradigm" exists', () => {
    expect(resolve('to|PRON', 'PRON')).toEqual({ paradigmId: null, via: 'pos' })
    expect(resolve('co|PRON', 'PRON')).toEqual({ paradigmId: null, via: 'pos' })
    expect(resolve('gdy|SCONJ', 'SCONJ')).toEqual({ paradigmId: null, via: 'pos' })
    expect(resolve('dzięki|INTJ', 'INTJ')).toEqual({ paradigmId: null, via: 'pos' })
  })

  it('the direct paradigm wins over a rename (wieczor|NOUN merged into wieczór|NOUN)', () => {
    expect(resolve('wieczór|NOUN', 'NOUN')).toEqual({ paradigmId: 'wieczór|NOUN', via: 'direct' })
  })

  it('a word with neither its own nor a renamed paradigm has none', () => {
    expect(resolve('powinien|VERB', 'VERB')).toEqual({ paradigmId: null, via: 'missing' })
  })

  it('every override names an existing paradigm or null', () => {
    for (const paradigmId of Object.values(PARADIGM_OVERRIDES)) {
      if (paradigmId !== null) expect(PARADIGM_IDS.has(paradigmId)).toBe(true)
    }
  })
})

describe('createParadigmResolver (guards)', () => {
  it('throws when an override names a paradigm that does not exist', () => {
    expect(() => createParadigmResolver(new Set(['spocić|VERB']), {})).toThrow(
      /override wpatrywać się\|VERB -> wpatrywać\|VERB: no such paradigm/,
    )
  })

  it('throws when two v1 paradigms were renamed to the same v2 word without an override', () => {
    const ids = new Set([...PARADIGM_IDS, 'a|NOUN', 'a|ADV'])
    expect(() => createParadigmResolver(ids, { 'a|NOUN': 'a|ADJ', 'a|ADV': 'a|ADJ' })).toThrow(
      /both a\|NOUN and a\|ADV were renamed to a\|ADJ/,
    )
  })
})
