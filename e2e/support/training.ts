/**
 * `/practice` (`TrainingSetupScreen.tsx`) helper for the collapsible blocks task 32 introduced
 * (`spec/tasks/32-training-setup-collapsible-blocks.md` §4).
 *
 * `TrainingBlock.tsx`'s header button's accessible name is "<title> <summary>" (title and
 * summary both live inside the button, task 32 §2) — matching by an anchored-at-start regex
 * of the block's `title` alone is what lets callers pass just the title without needing to
 * know or duplicate the live summary text.
 */
import { expect, type Page } from '@playwright/test'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Opens the training block whose header title is `title` (e.g. "Настроить тренировку форм",
 * "Сопоставление") and waits for its body region to actually mount — task 32's own "collapsed
 * body isn't in the DOM at all" contract means a bare click, with no wait, would race whatever
 * the caller does next against React committing the expanded body.
 */
export async function openTrainingBlock(page: Page, title: string): Promise<void> {
  const header = page.getByRole('button', { name: new RegExp(`^${escapeRegExp(title)}`) })
  await header.click()
  await expect(header).toHaveAttribute('aria-expanded', 'true')
}
