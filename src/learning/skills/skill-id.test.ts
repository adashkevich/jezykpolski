import { describe, expect, it } from 'vitest'
import type { Dimension } from './dimensions.ts'
import { decodeSkillId, decodeWordId, encodeSkillId, encodeWordId } from './skill-id.ts'

describe('encodeWordId / decodeWordId', () => {
  it('round-trips a NOUN lemma', () => {
    const id = encodeWordId('kobieta', 'NOUN')
    expect(id).toBe('kobieta|NOUN')
    expect(decodeWordId(id)).toEqual({ lemma: 'kobieta', pos: 'NOUN' })
  })

  it('round-trips every POS', () => {
    for (const pos of ['NOUN', 'VERB', 'ADJ', 'ADV'] as const) {
      const id = encodeWordId('słowo', pos)
      expect(decodeWordId(id)).toEqual({ lemma: 'słowo', pos })
    }
  })

  it('rejects a lemma containing the "|" separator', () => {
    expect(() => encodeWordId('a|b', 'NOUN')).toThrow()
  })

  it('rejects an empty lemma', () => {
    expect(() => encodeWordId('', 'NOUN')).toThrow()
  })

  it('decodeWordId throws on a malformed wordId (no separator)', () => {
    expect(() => decodeWordId('kobietaNOUN')).toThrow()
  })

  it('decodeWordId throws on an unknown pos', () => {
    expect(() => decodeWordId('kobieta|NOWN')).toThrow()
  })
})

describe('encodeSkillId / decodeSkillId round-trip on every dimension shape', () => {
  const wordId = encodeWordId('kobieta', 'NOUN')

  const dimensions: Dimension[] = [
    'vocab:pl-ru',
    'vocab:ru-pl',
    'noun:sg:genitive',
    'noun:pl:instrumental',
    'verb:present:1:sg',
    'verb:future:3:pl',
    'verb:past:1:sg:masculine',
    'verb:past:1:pl:non_masculine_personal',
    'verb:imperative:2:sg',
    'adj:sg:feminine:genitive',
    'adj:pl:neuter:dative',
    'adj:degree:comparative',
    'adj:degree:superlative',
    'adv:degree:comparative',
    'adv:degree:superlative',
  ]

  it.each(dimensions)('round-trips %s', (dimension) => {
    const skillId = encodeSkillId(wordId, dimension)
    expect(skillId).toBe(`${wordId}::${dimension}`)
    expect(decodeSkillId(skillId)).toEqual({ wordId, dimension })
  })

  it('uses "::" so a "|" inside wordId and ":" inside dimension never create ambiguity', () => {
    const skillId = encodeSkillId('kobieta|NOUN', 'noun:sg:genitive')
    expect(skillId).toBe('kobieta|NOUN::noun:sg:genitive')
    const { wordId: decodedWordId, dimension } = decodeSkillId(skillId)
    expect(decodedWordId).toBe('kobieta|NOUN')
    expect(dimension).toBe('noun:sg:genitive')
  })

  it('decodeSkillId throws on a malformed skillId (missing "::")', () => {
    expect(() => decodeSkillId('kobieta|NOUN:noun:sg:genitive')).toThrow()
  })
})
