/**
 * One `TrainingDimensionGroup` (`spec/tasks/19-practice-mode.md` §1) rendered as a checkbox
 * grid — "Падежи" for NOUN/ADJ, "Времена"/"Лица"/"Числа" for VERB, etc. The same component
 * for every group of every section: it only ever reads `group.options`/`selected`, never a
 * section-specific prop, which is what actually makes `TrainingSetupScreen` "один компонент,
 * три конфигурации" rather than three near-identical screens (FR-113).
 */
import { CheckboxRow } from './CheckboxRow.tsx'
import type { TrainingDimensionGroup } from '../config/training-sections.ts'

export function DimensionGroupFieldset({
  group,
  selected,
  onChange,
}: {
  group: TrainingDimensionGroup
  selected: readonly string[]
  onChange: (values: readonly string[]) => void
}) {
  const selectedSet = new Set(selected)

  function toggle(value: string) {
    const next = new Set(selectedSet)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange([...next])
  }

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-medium text-foreground">{group.labelRu}</legend>
      <div className="grid grid-cols-2 gap-x-3">
        {group.options.map((option) => (
          <CheckboxRow
            key={option.value}
            checked={selectedSet.has(option.value)}
            onChange={() => toggle(option.value)}
          >
            <span className="flex flex-col leading-tight">
              <span>{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.labelRu}</span>
            </span>
          </CheckboxRow>
        ))}
      </div>
    </fieldset>
  )
}
