import { describe, expect, it } from 'vitest'
import { NOUN_HINT_MODE_DEFAULT, resolvePromptMode } from './hint-mode.ts'

describe('resolvePromptMode', () => {
  it('the default setting is "lemma" (app-design §9\'s pre-selected radio)', () => {
    expect(NOUN_HINT_MODE_DEFAULT).toBe('lemma')
  })

  it('"lemma" and "translation" pass through unchanged, regardless of seed', () => {
    expect(resolvePromptMode('lemma', 1)).toBe('lemma')
    expect(resolvePromptMode('lemma', 2)).toBe('lemma')
    expect(resolvePromptMode('translation', 1)).toBe('translation')
    expect(resolvePromptMode('translation', 2)).toBe('translation')
  })

  it('"random" is deterministic: the same seed always resolves the same way', () => {
    expect(resolvePromptMode('random', 42)).toBe(resolvePromptMode('random', 42))
    expect(resolvePromptMode('random', -7)).toBe(resolvePromptMode('random', -7))
  })

  it('"random" actually alternates between both modes across different seeds', () => {
    const modes = new Set<string>()
    for (let seed = 0; seed < 20; seed++) {
      modes.add(resolvePromptMode('random', seed))
    }
    expect(modes).toEqual(new Set(['lemma', 'translation']))
  })

  it('negative seeds are handled the same as their positive counterparts (Math.abs)', () => {
    expect(resolvePromptMode('random', 5)).toBe(resolvePromptMode('random', -5))
  })
})
