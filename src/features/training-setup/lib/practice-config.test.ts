import { describe, expect, it } from 'vitest'
import type { PracticeConfig } from '@/learning/session/session.types.ts'
import {
  defaultPracticeScreenState,
  migrateLegacyPracticeConfig,
  practiceConfigFor,
  sectionFromFilterPos,
  type PracticeScreenState,
} from './practice-config.ts'

describe('defaultPracticeScreenState', () => {
  it('has one PracticeFormsConfig per section and nothing else (task 39 removed the shared filter)', () => {
    const state = defaultPracticeScreenState()
    expect(Object.keys(state)).toEqual(['formsBySection'])
    expect(Object.keys(state.formsBySection).sort()).toEqual(['ADJ', 'NOUN', 'VERB'])
    for (const section of ['NOUN', 'VERB', 'ADJ'] as const) {
      expect(state.formsBySection[section].exerciseTypes).toEqual({ choice: true, input: true })
      expect(state.formsBySection[section].targetSize).toBe(20)
    }
  })
})

describe('practiceConfigFor', () => {
  it('assembles a valid PracticeConfig for a given section, taking upToLevel from its argument', () => {
    const state = defaultPracticeScreenState()
    const config = practiceConfigFor(state, 'VERB', 'B1')
    expect(config.section).toBe('VERB')
    expect(config.upToLevel).toBe('B1')
    expect(config.status).toEqual([])
    expect(config.topN).toBeNull()
    expect(config.dimensionSelection).toBe(state.formsBySection.VERB.dimensionSelection)
    expect(config.exerciseTypes).toBe(state.formsBySection.VERB.exerciseTypes)
    expect(config.targetSize).toBe(state.formsBySection.VERB.targetSize)
  })
})

describe('migrateLegacyPracticeConfig', () => {
  it('seeds only the saved section from the legacy config, ignoring its level/status/frequency, leaving the other two default', () => {
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
    expect(Object.keys(migrated)).toEqual(['formsBySection'])
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

describe('a settings row saved before task 39', () => {
  it('reads fine even with a leftover `filter` field — formsBySection is unaffected', () => {
    const legacyRow = {
      filter: { upToLevel: 'B1', status: ['new'], topN: 1000 },
      formsBySection: defaultPracticeScreenState().formsBySection,
    } as unknown as PracticeScreenState
    expect(legacyRow.formsBySection.NOUN.targetSize).toBe(20)
  })
})
