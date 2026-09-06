/**
 * Regression guard for the iOS Safari auto-zoom bug (`spec/tasks/34-viewport-zoom-fix.md`
 * §3): a focused `<input>`/`<select>`/`<textarea>` whose computed `font-size` is under 16px
 * makes iOS Safari zoom the whole page in, and never zoom back out. `CONTROL_CLASS` (this
 * same directory's `control.ts`) is the fix — `text-base md:text-sm` renders 16px on mobile
 * widths and the previous, denser 14px again from `md` up — but nothing stops a *future*
 * field from being hand-written with a bare `text-sm`/`text-xs` again.
 *
 * This scans `src/**\/*.tsx` as plain text (no parser, no render — deliberately, see this
 * task's own header on why an approximate regex scan is the point: it only needs to catch
 * "a `text-sm`/`text-xs` class landed directly on a focusable text control", not parse JSX
 * correctly in general) for `<input`/`<select`/`<textarea` tags whose opening-tag text
 * contains `text-sm`/`text-xs` without an accompanying `text-base` — which is exactly what a
 * new hand-copied `className="h-11 ... text-sm ..."` (instead of `cn(CONTROL_CLASS, ...)`)
 * would look like. A tag that composes its class list from a shared constant (`CONTROL_CLASS`
 * itself, or any `cn(...)`/`clsx(...)` call referencing it) never has the literal string
 * `text-sm` sitting in the component's own source, so it never trips this scan — only a
 * hand-typed size class does.
 */
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** Depth-first `.tsx` file listing under `src/`, skipping test/story fixtures — this scan is
 *  about real app markup, not test scaffolding that happens to mention `<input>` in a string
 *  or a comment. */
function listTsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stats = statSync(full)
    if (stats.isDirectory()) {
      out.push(...listTsxFiles(full))
      continue
    }
    if (!entry.endsWith('.tsx')) continue
    if (entry.endsWith('.test.tsx') || entry.endsWith('.stories.tsx')) continue
    out.push(full)
  }
  return out
}

/** Matches an opening `<input`/`<select`/`<textarea` tag up to its first `>` — good enough
 *  for this codebase's plain attribute lists (no `>` used inside a JSX-expression attribute
 *  value on any control tag today); see this file's header on why an approximate match is the
 *  deliberate design here. */
const CONTROL_TAG_RE = /<(input|select|textarea)\b([^>]*)>/g

interface Violation {
  readonly file: string
  readonly line: number
  readonly tag: string
}

function findViolations(filePath: string, source: string): Violation[] {
  const violations: Violation[] = []
  for (const match of source.matchAll(CONTROL_TAG_RE)) {
    const [fullMatch, tag = '', attrs = ''] = match
    const hasSmallText = /\btext-(sm|xs)\b/.test(attrs)
    const hasBaseText = /\btext-base\b/.test(attrs)
    if (!hasSmallText || hasBaseText) continue

    const line = source.slice(0, match.index).split('\n').length
    violations.push({ file: relative(REPO_ROOT, filePath), line, tag: `<${tag}>` })
    void fullMatch
  }
  return violations
}

describe('CONTROL_CLASS regression scan (task 34 — iOS Safari auto-zoom)', () => {
  it('finds no <input>/<select>/<textarea> with text-sm/text-xs unaccompanied by text-base', () => {
    const files = listTsxFiles(join(REPO_ROOT, 'src'))
    const violations = files.flatMap((file) => findViolations(file, readFileSync(file, 'utf-8')))

    expect(
      violations,
      violations.length === 0
        ? ''
        : violations
            .map(
              (v) =>
                `${v.file}:${v.line} — ${v.tag} has a text-sm/text-xs class with no text-base ` +
                'alongside it. A focused control under 16px font-size makes iOS Safari zoom the ' +
                'whole page in (spec/tasks/34-viewport-zoom-fix.md). Use ' +
                "cn(CONTROL_CLASS, ...) from '@/components/ui/control.ts' instead of a hand-" +
                "written class string, or add 'text-base md:text-sm' directly.",
            )
            .join('\n'),
    ).toEqual([])
  })

  it('flags a hand-written text-sm input as a sanity check on the scanner itself', () => {
    const source = '<input type="text" className="h-11 text-sm text-foreground" />'
    expect(findViolations('fixture.tsx', source)).toHaveLength(1)
  })

  it('does not flag a control using CONTROL_CLASS via cn(...)', () => {
    const source =
      '<input type="text" className={cn(CONTROL_CLASS, \'w-full pr-11 pl-9\')} />'
    expect(findViolations('fixture.tsx', source)).toHaveLength(0)
  })

  it('does not flag text-sm paired with text-base on the same tag', () => {
    const source = '<select className="text-base md:text-sm" />'
    expect(findViolations('fixture.tsx', source)).toHaveLength(0)
  })
})
