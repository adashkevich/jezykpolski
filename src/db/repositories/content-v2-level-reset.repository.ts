/**
 * Task 49 (`spec/tasks/49-primary-sense-learning-and-level-reset.md` §1) — the one-time return
 * to A1 after the dictionary changed to v2 (levels are now those of each word's PRIMARY sense,
 * so ~790 words that used to sit in A2–B2 and were never started are A1 now).
 *
 * The level gate (`learning/session/level-gate.ts`) is computed on the fly from the index and
 * `newWordsStartLevel`, so for a user whose start level is A1 nothing needs doing — the new A1
 * words appear on their own. A user who once raised the start level (say to A2) has A1 closed for
 * good; this step is for them: `settings.newWordsStartLevel` goes back to
 * {@link NEW_WORDS_START_LEVEL_DEFAULT} (not written at all when it already is).
 *
 * Progress is not touched: started words stay started and keep coming back for review on their
 * schedule whatever their level (task 38, «Где ничего не меняется»). Only a user who HAS progress
 * gets the home-screen notice (`meta.contentV2Notice`): for an empty profile "the dictionary was
 * updated" says nothing — there is no old state to compare with — so that case resets a changed
 * start level silently and writes no notice. The notice is written for a user already on A1 too
 * (the banner then shows only its first sentence). The words-left count is not stored: the
 * banner reads it live.
 *
 * Both writes share one transaction, so `previousStartLevel` can't be lost between them (a
 * rerun after a half-done step would read the already-reset A1); `runOnce` records its key only
 * after the task resolved, so a failure reruns the whole step on the next start. Run from
 * `components/app/StartupMigrations.tsx`, after task 48's step.
 */
import {
  NEW_WORDS_START_LEVEL_DEFAULT,
  NEW_WORDS_START_LEVEL_SETTING_KEY,
} from '@/learning/session/level-gate.ts'
import { db } from '../database.ts'
import { setContentV2Notice } from './meta.repository.ts'
import * as settingsRepo from './settings.repository.ts'
import { hasAnySkill } from './skills.repository.ts'

/** `meta` key (via `runOnce`) of this step — `StartupMigrations.tsx`. */
export const CONTENT_V2_LEVEL_RESET_MIGRATION = 'content-v2-level-reset'

export async function runContentV2LevelReset(): Promise<void> {
  await db.transaction('rw', db.settings, db.meta, db.skills, async () => {
    const previousStartLevel = await settingsRepo.get(
      NEW_WORDS_START_LEVEL_SETTING_KEY,
      NEW_WORDS_START_LEVEL_DEFAULT,
    )
    if (previousStartLevel !== NEW_WORDS_START_LEVEL_DEFAULT) {
      await settingsRepo.set(NEW_WORDS_START_LEVEL_SETTING_KEY, NEW_WORDS_START_LEVEL_DEFAULT)
    }

    if (await hasAnySkill()) {
      await setContentV2Notice({ previousStartLevel, at: Date.now() })
    }
  })
}
