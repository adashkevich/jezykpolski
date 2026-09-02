import { beforeEach, describe, expect, it } from 'vitest'
import type { ExerciseInstance } from '@/learning/exercises/exercise.types.ts'
import { isFirstAnswerInSession, useSessionStore } from './session.store.ts'

function instance(id: string, skillId: string): ExerciseInstance {
  return {
    id,
    skillId,
    exercise: {
      type: 'choice',
      direction: 'pl-ru',
      prompt: 'x',
      options: ['a', 'b'],
      correct: 'a',
    },
  }
}

beforeEach(() => {
  useSessionStore.getState().reset()
})

describe('session.store', () => {
  it('startSession replaces the whole state', () => {
    const queue = [instance('e1', 's1')]
    useSessionStore.getState().startSession({ sessionId: 42, mode: 'learn', queue })
    const state = useSessionStore.getState()
    expect(state.sessionId).toBe(42)
    expect(state.mode).toBe('learn')
    expect(state.queue).toEqual(queue)
    expect(state.currentIndex).toBe(0)
    expect(state.answers.size).toBe(0)
    expect(state.firstAnswerBySkill.size).toBe(0)
    expect(state.mistakes).toEqual([])
  })

  it('recordAnswer sets firstAnswerBySkill only on the first attempt for a skill', () => {
    const i1 = instance('e1', 's1')
    const i2 = instance('e2', 's1') // same skill, second exercise instance (a requeue)
    useSessionStore.getState().startSession({ sessionId: 1, mode: 'learn', queue: [i1, i2] })

    useSessionStore.getState().recordAnswer(i1, {
      skillId: 's1',
      answerGiven: 'a',
      correct: false,
      rating: 1,
      elapsedMs: 100,
    })
    expect(useSessionStore.getState().firstAnswerBySkill.get('s1')).toBe(1)
    expect(useSessionStore.getState().mistakes).toEqual([i1])

    // Second attempt at the same skill: firstAnswerBySkill must NOT change (damping rule),
    // and a wrong retry doesn't get queued into `mistakes` a second time.
    useSessionStore.getState().recordAnswer(i2, {
      skillId: 's1',
      answerGiven: 'b',
      correct: false,
      rating: 1,
      elapsedMs: 50,
    })
    expect(useSessionStore.getState().firstAnswerBySkill.get('s1')).toBe(1)
    expect(useSessionStore.getState().mistakes).toEqual([i1])
    expect(useSessionStore.getState().answers.size).toBe(2)
  })

  it('isFirstAnswerInSession reflects firstAnswerBySkill membership', () => {
    useSessionStore.getState().startSession({ sessionId: 1, mode: 'learn', queue: [] })
    expect(isFirstAnswerInSession(useSessionStore.getState(), 's1')).toBe(true)
    useSessionStore.getState().recordAnswer(instance('e1', 's1'), {
      skillId: 's1',
      answerGiven: 'a',
      correct: true,
      rating: 3,
      elapsedMs: 10,
    })
    expect(isFirstAnswerInSession(useSessionStore.getState(), 's1')).toBe(false)
  })

  it('appendToQueue grows the queue without touching currentIndex', () => {
    useSessionStore
      .getState()
      .startSession({ sessionId: 1, mode: 'learn', queue: [instance('e1', 's1')] })
    useSessionStore.getState().advance()
    useSessionStore.getState().appendToQueue(instance('e2', 's2'))
    const state = useSessionStore.getState()
    expect(state.queue).toHaveLength(2)
    expect(state.currentIndex).toBe(1)
  })
})
