import { describe, expect, it } from 'vitest'
import { paradigmStem, splitEnding } from './form-ending.ts'

describe('paradigmStem', () => {
  it('finds the shared stem across regular forms', () => {
    const forms = ['osoba', 'osoby', 'osobie', 'osobę', 'osobą', 'osobo']
    expect(paradigmStem(forms)).toBe('osob')
  })

  it('is not dragged down by a minority of alternating forms', () => {
    // stopa/stopy/stopie/stopę/stopą/stopo/stopo, but genitive plural "stóp" alternates o->ó.
    const forms = ['stopa', 'stopy', 'stopie', 'stopę', 'stopą', 'stopo', 'stóp']
    expect(paradigmStem(forms)).toBe('stop')
  })

  it('returns empty for fewer than 2 distinct forms', () => {
    expect(paradigmStem(['menu'])).toBe('')
    expect(paradigmStem(['menu', 'menu'])).toBe('')
    expect(paradigmStem([])).toBe('')
  })
})

describe('splitEnding', () => {
  it('splits a regular form at the stem boundary', () => {
    expect(splitEnding('osoba', 'osob')).toEqual(['osob', 'a'])
    expect(splitEnding('osobie', 'osob')).toEqual(['osob', 'ie'])
  })

  it('renders plain when the stem is empty', () => {
    expect(splitEnding('menu', '')).toEqual(['menu', ''])
  })

  it('renders plain for a multi-word phrase', () => {
    expect(splitEnding('Rzeczpospolita Polska', 'rzecz')).toEqual(['Rzeczpospolita Polska', ''])
  })

  it('renders plain when the remainder is implausibly long', () => {
    expect(splitEnding('completely-different', 'osob')).toEqual(['completely-different', ''])
  })

  it('tolerates a one-letter softening right at the boundary', () => {
    // gospodarka -> stem "gospodar", locative "gospodarce" softens k->c at the cut.
    expect(splitEnding('gospodarce', 'gospodar')).toEqual(['gospodar', 'ce'])
  })

  it('handles a bare-stem form with an empty ending', () => {
    expect(splitEnding('kobiet', 'kobiet')).toEqual(['kobiet', ''])
  })
})
