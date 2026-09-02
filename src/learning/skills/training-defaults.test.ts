import { describe, expect, it } from 'vitest'
import type { Dimension } from './dimensions.ts'
import {
  INCLUDE_VOCATIVE_IN_TRAINING_DEFAULT,
  INCLUDE_VOCATIVE_IN_TRAINING_SETTING_KEY,
  isDimensionTrainedByDefault,
} from './training-defaults.ts'

describe('isDimensionTrainedByDefault', () => {
  it('excludes both noun vocative slots (singular and plural)', () => {
    expect(isDimensionTrainedByDefault('noun:sg:vocative')).toBe(false)
    expect(isDimensionTrainedByDefault('noun:pl:vocative')).toBe(false)
  })

  it('includes every other noun case', () => {
    const otherCases: Dimension[] = [
      'noun:sg:nominative',
      'noun:sg:genitive',
      'noun:sg:dative',
      'noun:sg:accusative',
      'noun:sg:instrumental',
      'noun:sg:locative',
      'noun:pl:nominative',
      'noun:pl:genitive',
    ]
    for (const dimension of otherCases) {
      expect(isDimensionTrainedByDefault(dimension)).toBe(true)
    }
  })

  it('includes vocab, VERB, ADJ and ADV dimensions unconditionally', () => {
    const nonNounDimensions: Dimension[] = [
      'vocab:pl-ru',
      'vocab:ru-pl',
      'verb:present:1:sg',
      'verb:past:3:sg:feminine',
      'verb:imperative:2:pl',
      'adj:sg:feminine:nominative',
      'adj:degree:comparative',
      'adv:degree:superlative',
    ]
    for (const dimension of nonNounDimensions) {
      expect(isDimensionTrainedByDefault(dimension)).toBe(true)
    }
  })
})

describe('INCLUDE_VOCATIVE_IN_TRAINING_* constants', () => {
  it('default off, with the settings key task 18/19 will read it under', () => {
    expect(INCLUDE_VOCATIVE_IN_TRAINING_DEFAULT).toBe(false)
    expect(INCLUDE_VOCATIVE_IN_TRAINING_SETTING_KEY).toBe('includeVocativeInTraining')
  })
})
