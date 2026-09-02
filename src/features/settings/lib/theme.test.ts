import { describe, expect, it } from 'vitest'
import { applyTheme } from './theme.ts'

function fakeRoot(): HTMLElement {
  return document.createElement('html')
}

describe('applyTheme', () => {
  it("'dark' adds .dark and removes .light", () => {
    const root = fakeRoot()
    root.classList.add('light')
    applyTheme('dark', root)
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.classList.contains('light')).toBe(false)
  })

  it("'light' adds .light and removes .dark", () => {
    const root = fakeRoot()
    root.classList.add('dark')
    applyTheme('light', root)
    expect(root.classList.contains('light')).toBe(true)
    expect(root.classList.contains('dark')).toBe(false)
  })

  it("'system' removes both classes", () => {
    const root = fakeRoot()
    root.classList.add('dark')
    applyTheme('system', root)
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.classList.contains('light')).toBe(false)

    const root2 = fakeRoot()
    root2.classList.add('light')
    applyTheme('system', root2)
    expect(root2.classList.contains('dark')).toBe(false)
    expect(root2.classList.contains('light')).toBe(false)
  })

  it('the two classes are always mutually exclusive after applying any preference', () => {
    const root = fakeRoot()
    for (const pref of ['dark', 'light', 'system'] as const) {
      applyTheme(pref, root)
      expect(root.classList.contains('dark') && root.classList.contains('light')).toBe(false)
    }
  })
})
