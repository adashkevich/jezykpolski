/**
 * `WordIndexEntry.levels` / `Sense.levels` for test fixtures: the same level in every language
 * profile (task 47), so a fixture's `level` and `levels.ru` never disagree.
 */
import type { LevelValue } from '@/content/codec.ts'
import type { ProfileLevels } from '@/types/content.ts'

export function uniformLevels(level: LevelValue): ProfileLevels {
  return { ru: level, by: level, ua: level }
}
