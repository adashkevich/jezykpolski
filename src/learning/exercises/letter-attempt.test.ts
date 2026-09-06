/**
 * `letter-attempt.ts` (`spec/tasks/29-letter-by-letter-input.md` §1, FR-59, FR-84, FR-85,
 * FR-86) — машина состояний побуквенного ввода.
 */
import { describe, expect, it } from 'vitest'
import {
  attemptValue,
  createLetterAttempt,
  eraseLetter,
  outcomeOf,
  revealAll,
  revealCurrentLetter,
  submittedAnswer,
  typeLetter,
  typeLetters,
  type LetterAttempt,
} from './letter-attempt.ts'

function states(attempt: LetterAttempt) {
  return attempt.cells.map((c) => c.state)
}

describe('createLetterAttempt', () => {
  it('строит одну ячейку на букву, все пустые, курсор на нуле', () => {
    const attempt = createLetterAttempt(['kotek'])
    expect(attempt.cells).toHaveLength(5)
    expect(states(attempt)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty'])
    expect(attempt.cursor).toBe(0)
    expect(attempt.complete).toBe(false)
  })

  it('пробел, дефис и апостроф становятся отдельными ячейками-разделителями', () => {
    const attempt = createLetterAttempt(['będziemy robić'])
    const spaceIndex = 8
    expect(attempt.cells[spaceIndex]!.state).toBe('separator')
    expect(attempt.cells[spaceIndex]!.shown).toBe(' ')
    // Курсор сразу перескакивает пробел, если он оказывается первым непройденным элементом.
    expect(attempt.cursor).toBe(0)
  })

  it('кандидаты другой длины, чем accepted[0], отбрасываются сразу', () => {
    const attempt = createLetterAttempt(['abc', 'ab'])
    expect(attempt.candidates).toEqual(['abc'])
  })

  it('пустой accepted — ошибка вызывающего кода', () => {
    expect(() => createLetterAttempt([])).toThrow()
  })
})

describe('typeLetter — верная буква', () => {
  it('заполняет ячейку эталонным символом и двигает курсор', () => {
    let attempt = createLetterAttempt(['kot'])
    attempt = typeLetter(attempt, 'k')
    expect(attempt.cells[0]).toMatchObject({ shown: 'k', state: 'correct' })
    expect(attempt.cursor).toBe(1)
  })

  it('регистр не важен для сравнения, но отображается эталонный регистр', () => {
    const attempt = typeLetter(createLetterAttempt(['Kot']), 'k')
    expect(attempt.cells[0]).toMatchObject({ shown: 'K', state: 'correct' })
  })

  it('ё и е считаются одной буквой', () => {
    const attempt = typeLetter(createLetterAttempt(['ёж']), 'е')
    expect(attempt.cells[0]).toMatchObject({ shown: 'ё', state: 'correct' })
  })

  it('польские диакритики не сворачиваются — o против ą это ошибка', () => {
    const attempt = typeLetter(createLetterAttempt(['ą']), 'o')
    expect(attempt.cells[0]!.state).toBe('wrong')
  })

  it('последняя верная буква завершает попытку', () => {
    const attempt = typeLetters(createLetterAttempt(['no']), 'no')
    expect(attempt.complete).toBe(true)
    expect(attempt.cursor).toBe(2)
  })

  it('пробел внутри слова — no-op, курсор не двигается искусственно дважды', () => {
    const attempt = typeLetters(createLetterAttempt(['a b']), 'a b')
    expect(attempt.complete).toBe(true)
    expect(attemptValue(attempt)).toBe('a b')
  })
})

describe('typeLetter — неверная буква', () => {
  it('курсор не двигается, ячейка помечается wrong', () => {
    let attempt = createLetterAttempt(['kot'])
    attempt = typeLetter(attempt, 'z')
    expect(attempt.cells[0]).toMatchObject({ shown: 'z', state: 'wrong' })
    expect(attempt.cursor).toBe(0)
    expect(attempt.mistakes).toBe(1)
  })

  it('следующее верное нажатие заменяет неверную букву, а не добавляется рядом', () => {
    let attempt = createLetterAttempt(['kot'])
    attempt = typeLetter(attempt, 'z')
    attempt = typeLetter(attempt, 'k')
    expect(attempt.cells[0]).toMatchObject({ shown: 'k', state: 'corrected' })
    expect(attempt.cells[1]!.state).toBe('empty')
    expect(attempt.cursor).toBe(1)
  })

  it('счёт ошибок — один раз на ячейку, а не на нажатие', () => {
    let attempt = createLetterAttempt(['kot'])
    attempt = typeLetter(attempt, 'x')
    attempt = typeLetter(attempt, 'y')
    attempt = typeLetter(attempt, 'z')
    expect(attempt.mistakes).toBe(1)
    expect(attempt.cursor).toBe(0)
  })

  it('ошибка в одном слоте не мешает верно набрать следующий после исправления', () => {
    let attempt = createLetterAttempt(['kot'])
    attempt = typeLetter(attempt, 'x')
    attempt = typeLetters(attempt, 'kot')
    expect(attempt.complete).toBe(true)
    expect(attempt.mistakes).toBe(1)
  })
})

describe('eraseLetter', () => {
  it('стирает только неверную букву, возвращает ячейку в empty', () => {
    let attempt = createLetterAttempt(['kot'])
    attempt = typeLetter(attempt, 'z')
    attempt = eraseLetter(attempt)
    expect(attempt.cells[0]).toMatchObject({ shown: null, state: 'empty' })
    expect(attempt.cursor).toBe(0)
  })

  it('не стирает подтверждённую букву', () => {
    let attempt = createLetterAttempt(['kot'])
    attempt = typeLetter(attempt, 'k')
    const before = attempt
    attempt = eraseLetter(attempt)
    expect(attempt).toEqual(before)
  })

  it('no-op на пустой ячейке', () => {
    const attempt = createLetterAttempt(['kot'])
    expect(eraseLetter(attempt)).toEqual(attempt)
  })
})

describe('accepted с несколькими написаниями (form-input)', () => {
  it('оба варианта равной длины доходят до complete', () => {
    const viaJi = typeLetters(createLetterAttempt(['aborcji', 'aborcyj']), 'aborcji')
    expect(viaJi.complete).toBe(true)
    expect(viaJi.mistakes).toBe(0)

    const viaYj = typeLetters(createLetterAttempt(['aborcji', 'aborcyj']), 'aborcyj')
    expect(viaYj.complete).toBe(true)
    expect(viaYj.mistakes).toBe(0)
  })

  it('кандидаты сужаются по мере ввода и не расширяются обратно', () => {
    let attempt = createLetterAttempt(['aborcji', 'aborcyj'])
    attempt = typeLetters(attempt, 'aborc')
    expect(attempt.candidates).toEqual(['aborcji', 'aborcyj'])
    attempt = typeLetter(attempt, 'j')
    expect(attempt.candidates).toEqual(['aborcji'])
  })
})

describe('revealCurrentLetter (подсказка)', () => {
  it('заполняет только текущую ячейку эталоном, курсор двигается', () => {
    let attempt = createLetterAttempt(['kot'])
    attempt = revealCurrentLetter(attempt)
    expect(attempt.cells[0]).toMatchObject({ shown: 'k', state: 'hinted' })
    expect(attempt.cursor).toBe(1)
    expect(attempt.hintsUsed).toBe(1)
  })

  it('подсказка на последней букве завершает попытку', () => {
    let attempt = createLetterAttempt(['no'])
    attempt = typeLetter(attempt, 'n')
    attempt = revealCurrentLetter(attempt)
    expect(attempt.complete).toBe(true)
  })

  it('подсказка поверх wrong перебивает её', () => {
    let attempt = createLetterAttempt(['kot'])
    attempt = typeLetter(attempt, 'z')
    attempt = revealCurrentLetter(attempt)
    expect(attempt.cells[0]).toMatchObject({ shown: 'k', state: 'hinted' })
    expect(attempt.mistakes).toBe(1) // уже засчитанная ошибка не отменяется
  })
})

describe('revealAll (глазок)', () => {
  it('раскрывает всё слово и немедленно завершает попытку', () => {
    const attempt = revealAll(createLetterAttempt(['kotek']))
    expect(attempt.revealed).toBe(true)
    expect(attempt.complete).toBe(true)
    expect(states(attempt)).toEqual(['revealed', 'revealed', 'revealed', 'revealed', 'revealed'])
  })

  it('уже верно набранные буквы остаются correct, а не revealed', () => {
    let attempt = createLetterAttempt(['kotek'])
    attempt = typeLetters(attempt, 'ko')
    attempt = revealAll(attempt)
    expect(attempt.cells[0]!.state).toBe('correct')
    expect(attempt.cells[1]!.state).toBe('correct')
    expect(attempt.cells[2]!.state).toBe('revealed')
  })
})

describe('submittedAnswer', () => {
  it('без раскрытия — полная строка выбранного варианта', () => {
    const attempt = typeLetters(createLetterAttempt(['kotek']), 'kotek')
    expect(submittedAnswer(attempt)).toBe('kotek')
  })

  it('после глазка — только подтверждённый пользователем префикс', () => {
    let attempt = createLetterAttempt(['osiągnąć'])
    attempt = typeLetters(attempt, 'osią')
    attempt = revealAll(attempt)
    expect(submittedAnswer(attempt)).toBe('osią')
  })

  it('глазок без единой набранной буквы — пустая строка', () => {
    const attempt = revealAll(createLetterAttempt(['kot']))
    expect(submittedAnswer(attempt)).toBe('')
  })
})

describe('attemptValue', () => {
  it('конкатенация показанного, включая разделители', () => {
    const attempt = typeLetters(createLetterAttempt(['a b']), 'a')
    expect(attemptValue(attempt)).toBe('a ')
  })
})

describe('outcomeOf', () => {
  it('letterCount не считает разделители', () => {
    const attempt = createLetterAttempt(['a b'])
    expect(outcomeOf(attempt).letterCount).toBe(2)
  })

  it('переносит mistakes/hintsUsed/revealed без изменений', () => {
    let attempt = createLetterAttempt(['kot'])
    attempt = typeLetter(attempt, 'z')
    attempt = revealCurrentLetter(attempt)
    const outcome = outcomeOf(attempt)
    expect(outcome.mistakes).toBe(1)
    expect(outcome.hintsUsed).toBe(1)
    expect(outcome.revealed).toBe(false)
  })
})

describe('иммутабельность', () => {
  it('typeLetter не мутирует вход', () => {
    const attempt = createLetterAttempt(['kot'])
    const snapshot = JSON.parse(JSON.stringify(attempt))
    typeLetter(attempt, 'k')
    expect(attempt).toEqual(snapshot)
  })
})
