/**
 * Какие из ошибок сессии «Разобрать ошибки» действительно зададут (финальное ревью 41–45, I2).
 *
 * «Показать слово» на `vocab:ru-pl-input` — ошибка в итогах (`correct: false`, слово стоит в
 * списке «Ошибки» и входит в `mistakeSkillIds`), но `SkillRecord.awaitingRecognition` (задача 43)
 * запирает этот ввод до серии узнаваний, и `learning/session/build-learn-queue.ts#
 * collapseVocabStages` отбрасывает его из любой очереди — в том числе из сессии «Ошибки». Кнопка
 * с одним таким словом вела бы в «Нечего изучать прямо сейчас». Поэтому кнопка и её сессия
 * работают по этому списку, а не по `mistakeSkillIds` целиком; сам список «Ошибки» на экране
 * не меняется — слово в нём остаётся.
 *
 * Блокировка читается из БД на момент открытия итогов, а не из логов: логи не знают, снял ли её
 * «Знаю» на этапе выбора или серия узнаваний уже после ответа-«глазка». Навык, которого в БД уже
 * нет, остаётся в списке — его молча отбросит сам `resolveMistakeScope`, как и раньше.
 */
import { getSkill } from '@/db/repositories/skills.repository.ts'
import { isAwaitingRecognition } from '@/learning/progress/stage.ts'
import type { SkillId } from '@/learning/skills/skill-id.ts'
import { mistakeSkillIds, type SessionSummaryView } from './build-session-summary.ts'

export async function retryableMistakeSkillIds(summary: SessionSummaryView): Promise<SkillId[]> {
  const skillIds = mistakeSkillIds(summary)
  const skills = await Promise.all(skillIds.map((skillId) => getSkill(skillId)))
  return skillIds.filter((_, i) => !isAwaitingRecognition(skills[i]))
}
