/**
 * `answer-diff.ts` (`spec/tasks/28-two-stage-vocabulary-and-letter-diff.md` §3, FR-58).
 *
 * Проверяется именно выравнивание, а не позиционное сравнение: пропуск/лишняя буква не
 * должны красить весь хвост слова.
 */
import { describe, expect, it } from 'vitest'
import { diffAnswer, pickClosestExpected, type AnswerDiff, type DiffKind } from './answer-diff.ts'

/** Компактная запись диффа для сравнений: `'kotek'` + маска видов, буква к букве. */
function kinds(part: AnswerDiff['typed'] | AnswerDiff['expected']): DiffKind[] {
  return part.map((c) => c.kind)
}

function text(part: AnswerDiff['typed'] | AnswerDiff['expected']): string {
  return part.map((c) => c.char).join('')
}

describe('diffAnswer — совпадения и регистр', () => {
  it('полностью верный ответ — все буквы зелёные с обеих сторон', () => {
    const diff = diffAnswer('kotek', 'kotek')
    expect(kinds(diff.typed)).toEqual(['match', 'match', 'match', 'match', 'match'])
    expect(kinds(diff.expected)).toEqual(['match', 'match', 'match', 'match', 'match'])
    expect(diff.equal).toBe(true)
  })

  it('регистр не учитывается (acceptance)', () => {
    const diff = diffAnswer('KoTek', 'kotek')
    expect(diff.equal).toBe(true)
    // Отображается ровно то, что человек ввёл, — сворачивание только для сравнения.
    expect(text(diff.typed)).toBe('KoTek')
    expect(text(diff.expected)).toBe('kotek')
  })

  it('ё и е считаются одной буквой', () => {
    expect(diffAnswer('ежик', 'ёжик').equal).toBe(true)
    expect(diffAnswer('Ёжик', 'ежик').equal).toBe(true)
  })

  it('лишние пробелы по краям и внутри схлопываются, как в grade', () => {
    expect(diffAnswer('  będziemy  robić ', 'będziemy robić').equal).toBe(true)
  })
})

describe('diffAnswer — виды ошибок', () => {
  it('замена: одна красная буква, остальные зелёные', () => {
    const diff = diffAnswer('kotak', 'kotek')
    expect(kinds(diff.typed)).toEqual(['match', 'match', 'match', 'wrong', 'match'])
    expect(kinds(diff.expected)).toEqual(['match', 'match', 'match', 'wrong', 'match'])
    expect(diff.expected[3]!.char).toBe('e')
    expect(diff.equal).toBe(false)
  })

  it('пропущенная буква не красит весь хвост (ради этого и выравнивание)', () => {
    const diff = diffAnswer('ktek', 'kotek')
    expect(kinds(diff.typed)).toEqual(['match', 'match', 'match', 'match'])
    expect(kinds(diff.expected)).toEqual(['match', 'missing', 'match', 'match', 'match'])
    expect(diff.expected[1]!.char).toBe('o')
  })

  it('лишняя буква помечается в введённом ответе, эталон остаётся целиком зелёным', () => {
    const diff = diffAnswer('kootek', 'kotek')
    // Удвоенная «o» — лишняя ровно одна буква; какая именно из двух одинаковых помечена,
    // выравниванию безразлично, поэтому проверяется состав, а не позиция.
    expect(diff.typed.filter((c) => c.kind === 'extra')).toHaveLength(1)
    expect(diff.typed.filter((c) => c.kind === 'match')).toHaveLength(5)
    expect(diff.typed.some((c) => c.kind === 'wrong')).toBe(false)
    expect(kinds(diff.expected)).toEqual(['match', 'match', 'match', 'match', 'match'])
  })

  it('пустой ответ: весь эталон красный, введённая часть пуста', () => {
    const diff = diffAnswer('', 'kotek')
    expect(diff.typed).toHaveLength(0)
    expect(kinds(diff.expected)).toEqual(['missing', 'missing', 'missing', 'missing', 'missing'])
    expect(diff.equal).toBe(false)
  })

  it('совсем другое слово: ни одной случайной пары «зелёный» там, где букв нет', () => {
    const diff = diffAnswer('pies', 'kot')
    expect(kinds(diff.typed)).not.toContain('match')
    expect(text(diff.expected)).toBe('kot')
  })
})

describe('diffAnswer — польские диакритики (главный случай FR-58)', () => {
  it('буквы без диакритики — красные, остальные зелёные', () => {
    // żółty: ż/ó/ł — все три с диакритикой, t/y — без.
    const diff = diffAnswer('zolty', 'żółty')
    expect(kinds(diff.typed)).toEqual(['wrong', 'wrong', 'wrong', 'match', 'match'])
    expect(kinds(diff.expected)).toEqual(['wrong', 'wrong', 'wrong', 'match', 'match'])
    expect(text(diff.expected)).toBe('żółty')
  })

  it('ł тоже не сворачивается (у неё нет Unicode-декомпозиции)', () => {
    const diff = diffAnswer('lyzka', 'łyżka')
    expect(diff.typed[0]!.kind).toBe('wrong')
    expect(diff.typed[2]!.kind).toBe('wrong')
    expect(diff.typed[1]!.kind).toBe('match')
  })
})

describe('pickClosestExpected', () => {
  it('выбирает ближайший из нескольких принятых переводов', () => {
    expect(pickClosestExpected('дамв', ['женщина', 'дама'])).toBe('дама')
    expect(pickClosestExpected('женщена', ['женщина', 'дама'])).toBe('женщина')
  })

  it('при равном расстоянии побеждает первый (канонический) вариант', () => {
    // Оба кандидата на расстоянии 3 от «kot» — порядок решает, а `accepted[0]` тот же, что
    // показывает `correctAnswerOf`.
    expect(pickClosestExpected('kot', ['abc', 'xyz'])).toBe('abc')
  })

  it('единственный кандидат возвращается как есть', () => {
    expect(pickClosestExpected('cokolwiek', ['kobieta'])).toBe('kobieta')
  })

  it('пустой список — ошибка вызывающего кода', () => {
    expect(() => pickClosestExpected('kot', [])).toThrow()
  })
})
