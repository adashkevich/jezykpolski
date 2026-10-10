/**
 * `LangProfileScreen` (`spec/tasks/52-language-onboarding.md` §2, §3 point 4): two radio
 * cards — one choice only, nothing preselected, «Продолжить» locked until a pick, and a failed
 * write leaves the screen up with a message and lets the learner retry.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LangProfileScreen } from './LangProfileScreen.tsx'

afterEach(() => {
  cleanup()
})

describe('LangProfileScreen', () => {
  it('asks which language the learner knows, with the Russian and Belarusian cards', () => {
    render(<LangProfileScreen onChoose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Какой язык вы знаете?' })).toBeInTheDocument()
    const group = screen.getByRole('radiogroup', { name: 'Какой язык вы знаете?' })
    expect(group).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.getByRole('radio', { name: /Русский/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Белорусский/ })).toBeInTheDocument()
  })

  it('draws a flag on each card, hidden from assistive tech (the language is written next to it)', () => {
    const { container } = render(<LangProfileScreen onChoose={vi.fn()} />)

    const flags = container.querySelectorAll('svg[data-flag]')
    expect([...flags].map((flag) => flag.getAttribute('data-flag'))).toEqual(['ru', 'bcb'])
    for (const flag of flags) expect(flag).toHaveAttribute('aria-hidden', 'true')
  })

  it('draws the white-red-white flag for Belarusian, not the red-green state one', () => {
    const { container } = render(<LangProfileScreen onChoose={vi.fn()} />)

    const bcb = container.querySelector('svg[data-flag="bcb"]')!
    const stripes = [...bcb.querySelectorAll('rect[data-stripe]')].map((rect) =>
      rect.getAttribute('fill')?.toLowerCase(),
    )
    expect(stripes).toHaveLength(3)
    expect(stripes[0]).toBe(stripes[2])
    expect(stripes[0]).toBe('#ffffff')
    expect(stripes[1]).not.toBe('#ffffff')
  })

  it('preselects nothing and keeps «Продолжить» disabled until a card is picked', async () => {
    const user = userEvent.setup()
    const onChoose = vi.fn().mockResolvedValue(undefined)
    render(<LangProfileScreen onChoose={onChoose} />)

    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked()
    const next = screen.getByRole('button', { name: 'Продолжить' })
    expect(next).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: /Белорусский/ }))
    expect(next).toBeEnabled()
  })

  it('lets exactly one card be selected; picking the other one moves the selection', async () => {
    const user = userEvent.setup()
    render(<LangProfileScreen onChoose={vi.fn()} />)

    const ru = screen.getByRole('radio', { name: /Русский/ })
    const by = screen.getByRole('radio', { name: /Белорусский/ })

    await user.click(by)
    expect(by).toBeChecked()
    expect(ru).not.toBeChecked()

    await user.click(ru)
    expect(ru).toBeChecked()
    expect(by).not.toBeChecked()
  })

  it('hands over "ru" for the Russian card', async () => {
    const user = userEvent.setup()
    const onChoose = vi.fn().mockResolvedValue(undefined)
    render(<LangProfileScreen onChoose={onChoose} />)

    await user.click(screen.getByRole('radio', { name: /Русский/ }))
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(onChoose).toHaveBeenCalledExactlyOnceWith('ru')
  })

  it('hands over "by" for the Belarusian card (the Russian + Belarusian profile)', async () => {
    const user = userEvent.setup()
    const onChoose = vi.fn().mockResolvedValue(undefined)
    render(<LangProfileScreen onChoose={onChoose} />)

    await user.click(screen.getByRole('radio', { name: /Белорусский/ }))
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(onChoose).toHaveBeenCalledExactlyOnceWith('by')
  })

  it('locks the screen while the choice is being saved, so it cannot be sent twice', async () => {
    const user = userEvent.setup()
    let finish!: () => void
    const onChoose = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    render(<LangProfileScreen onChoose={onChoose} />)

    await user.click(screen.getByRole('radio', { name: /Русский/ }))
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))
    expect(onChoose).toHaveBeenCalledTimes(1)

    finish()
  })

  it('stays up with an error and lets the learner retry when saving fails', async () => {
    const user = userEvent.setup()
    const onChoose = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined)
    render(<LangProfileScreen onChoose={onChoose} />)

    await user.click(screen.getByRole('radio', { name: /Белорусский/ }))
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить выбор')
    // The pick survives and the button is live again.
    expect(screen.getByRole('radio', { name: /Белорусский/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Продолжить' }))
    await waitFor(() => expect(onChoose).toHaveBeenCalledTimes(2))
    expect(onChoose).toHaveBeenLastCalledWith('by')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
