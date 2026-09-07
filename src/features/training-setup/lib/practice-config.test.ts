import { describe, expect, it } from 'vitest'
import type { PracticeConfig } from '@/learning/session/session.types.ts'
import {
  applyIncomingFilter,
  defaultPracticeScreenState,
  migrateLegacyPracticeConfig,
  practiceConfigFor,
  sectionFromFilterPos,
} from './practice-config.ts'

describe('defaultPracticeScreenState', () => {
  it('has a section-less filter and one PracticeFormsConfig per section', () => {
    const state = defaultPracticeScreenState()
    expect(state.filter).toEqual({ upToLevel: null, status: ['new', 'learning'], topN: null })
    expect(Object.keys(state.formsBySection).sort()).toEqual(['ADJ', 'NOUN', 'VERB'])
    for (const section of ['NOUN', 'VERB', 'ADJ'] as const) {
      expect(state.formsBySection[section].exerciseTypes).toEqual({ choice: true, input: true })
      expect(state.formsBySection[section].targetSize).toBe(20)
    }
  })
})

describe('practiceConfigFor', () => {
  it('assembles a valid PracticeConfig for a given section from the split state', () => {
    const state = defaultPracticeScreenState()
    const config = practiceConfigFor(state, 'VERB')
    expect(config.section).toBe('VERB')
    expect(config.upToLevel).toBe(state.filter.upToLevel)
    expect(config.status).toBe(state.filter.status)
    expect(config.topN).toBe(state.filter.topN)
    expect(config.dimensionSelection).toBe(state.formsBySection.VERB.dimensionSelection)
    expect(config.exerciseTypes).toBe(state.formsBySection.VERB.exerciseTypes)
    expect(config.targetSize).toBe(state.formsBySection.VERB.targetSize)
  })
})

describe('migrateLegacyPracticeConfig', () => {
  it('seeds the shared filter and only the saved section, leaving the other two default', () => {
    const legacy: PracticeConfig = {
      section: 'NOUN',
      upToLevel: 'B1',
      status: ['known'],
      topN: 1000,
      includeTranslation: false,
      dimensionSelection: { case: ['genitive'] },
      exerciseTypes: { choice: true, input: false },
      targetSize: 30,
    }
    const migrated = migrateLegacyPracticeConfig(legacy)
    expect(migrated.filter).toEqual({ upToLevel: 'B1', status: ['known'], topN: 1000 })
    expect(migrated.formsBySection.NOUN).toEqual({
      includeTranslation: false,
      dimensionSelection: { case: ['genitive'] },
      exerciseTypes: { choice: true, input: false },
      targetSize: 30,
    })
    const defaults = defaultPracticeScreenState()
    expect(migrated.formsBySection.VERB).toEqual(defaults.formsBySection.VERB)
    expect(migrated.formsBySection.ADJ).toEqual(defaults.formsBySection.ADJ)
  })
})

describe('sectionFromFilterPos', () => {
  it('narrows a single-POS filter to a supported section', () => {
    expect(sectionFromFilterPos(['VERB'])).toBe('VERB')
  })

  it('returns undefined for no filter, multiple POS, or ADV', () => {
    expect(sectionFromFilterPos(undefined)).toBeUndefined()
    expect(sectionFromFilterPos(['NOUN', 'VERB'])).toBeUndefined()
    expect(sectionFromFilterPos(['ADV'])).toBeUndefined()
  })
})

describe('applyIncomingFilter', () => {
  it('overlays only the fields the incoming filter specifies, leaving formsBySection untouched', () => {
    const state = defaultPracticeScreenState()
    const next = applyIncomingFilter(state, { upToLevel: 'A2', sort: 'frequency' })
    expect(next.filter.upToLevel).toBe('A2')
    expect(next.filter.status).toBe(state.filter.status)
    expect(next.formsBySection).toBe(state.formsBySection)
  })
})
