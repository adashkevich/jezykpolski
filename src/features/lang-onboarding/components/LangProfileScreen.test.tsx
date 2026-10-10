/**
 * `LangProfileScreen` (`spec/tasks/52-language-onboarding.md` §2, §3 point 4): three checkbox
 * cards — «Знаю русский» ticked from the start, any combination allowed (Russian may be
 * un-ticked), «Продолжить» locked while nothing is ticked, and a failed write leaves the screen
 * up with a message and lets the learner retry.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LangProfileScreen } from './LangProfileScreen.tsx'

afterEach(() => {
  cleanup()
})

const ru = () => screen.getByRole('checkbox', { name: /русский/ })
const by = () => screen.getByRole('checkbox', { name: /беларуский/ })
const ua = () => screen.getByRole('checkbox', { name: /украинский/ })
const next = () => screen.getByRole('button', { name: 'Продолжить' })

/** The colour of each stripe of a flag, top to bottom. */
function stripes(container: HTMLElement, flag: string) {
  return [...container.querySelectorAll(`svg[data-flag="${flag}"] rect[data-stripe]`)].map((rect) =>
    rect.getAttribute('fill')?.toLowerCase(),
  )
}

describe('LangProfileScreen', () => {
  it('asks which languages the learner knows, with three «Знаю …» cards', () => {
    render(<LangProfileScreen onChoose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Какие языки вы знаете?' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Какие языки вы знаете?' })).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.getByLabelText('Знаю русский')).toBe(ru())
    expect(screen.getByLabelText('Знаю беларуский')).toBe(by())
    expect(screen.getByLabelText('Знаю украинский')).toBe(ua())
  })

  it('writes Belarusian as «беларуский», never «белорусский»', () => {
    const { container } = render(<LangProfileScreen onChoose={vi.fn()} />)

    expect(container.textContent).toContain('беларуский')
    expect(container.textContent).not.toMatch(/белорус/i)
  })

  it('ticks Russian from the start and nothing else, so «Продолжить» is live at once', () => {
    render(<LangProfileScreen onChoose={vi.fn()} />)

    expect(ru()).toBeChecked()
    expect(by()).not.toBeChecked()
    expect(ua()).not.toBeChecked()
    expect(next()).toBeEnabled()
  })

  it('draws a flag on each card, hidden from assistive tech (the language is written next to it)', () => {
    const { container } = render(<LangProfileScreen onChoose={vi.fn()} />)

    const flags = container.querySelectorAll('svg[data-flag]')
    expect([...flags].map((flag) => flag.getAttribute('data-flag'))).toEqual(['ru', 'bcb', 'ua'])
    for (const flag of flags) expect(flag).toHaveAttribute('aria-hidden', 'true')
  })

  it('draws Russia as white-blue-white — the bottom stripe is white, not red', () => {
    const { container } = render(<LangProfileScreen onChoose={vi.fn()} />)

    expect(stripes(container, 'ru')).toEqual(['#ffffff', '#0039a6', '#ffffff'])
  })

  it('draws the white-red-white flag for Belarusian, not the red-green state one', () => {
    const { container } = render(<LangProfileScreen onChoose={vi.fn()} />)

    const [top, middle, bottom] = stripes(container, 'bcb')
    expect(top).toBe('#ffffff')
    expect(bottom).toBe('#ffffff')
    expect(middle).not.toBe('#ffffff')
    expect(stripes(container, 'bcb')).toHaveLength(3)
  })

  it('draws Ukraine as blue over yellow', () => {
    const { container } = render(<LangProfileScreen onChoose={vi.fn()} />)

    expect(stripes(container, 'ua')).toEqual(['#0057b7', '#ffd700'])
  })

  it('hands over just Russian when nothing was changed', async () => {
    const user = userEvent.setup()
    const onChoose = vi.fn().mockResolvedValue(undefined)
    render(<LangProfileScreen onChoose={onChoose} />)

    await user.click(next())

    expect(onChoose).toHaveBeenCalledExactlyOnceWith(['ru'])
  })

  it('lets several languages be ticked, handed over in ru, by, ua order', async () => {
    const user = userEvent.setup()
    const onChoose = vi.fn().mockResolvedValue(undefined)
    render(<LangProfileScreen onChoose={onChoose} />)

    await user.click(ua())
    await user.click(by())
    expect(ru()).toBeChecked()
    expect(by()).toBeChecked()
    expect(ua()).toBeChecked()
    await user.click(next())

    expect(onChoose).toHaveBeenCalledExactlyOnceWith(['ru', 'by', 'ua'])
  })

  it('lets Russian be un-ticked: a Belarusian-only answer is handed over without it', async () => {
    const user = userEvent.setup()
    const onChoose = vi.fn().mockResolvedValue(undefined)
    render(<LangProfileScreen onChoose={onChoose} />)

    await user.click(by())
    await user.click(ru())
    expect(ru()).not.toBeChecked()
    await user.click(next())

    expect(onChoose).toHaveBeenCalledExactlyOnceWith(['by'])
  })

  it('un-ticking and ticking again is just toggling', async () => {
    const user = userEvent.setup()
    const onChoose = vi.fn().mockResolvedValue(undefined)
    render(<LangProfileScreen onChoose={onChoose} />)

    await user.click(ua())
    await user.click(ua())
    expect(ua()).not.toBeChecked()
    await user.click(next())

    expect(onChoose).toHaveBeenCalledExactlyOnceWith(['ru'])
  })

  it('locks «Продолжить» with a hint while no language is ticked, and frees it with the next tick', async () => {
    const user = userEvent.setup()
    const onChoose = vi.fn().mockResolvedValue(undefined)
    render(<LangProfileScreen onChoose={onChoose} />)
    expect(screen.queryByText('Отметьте хотя бы один язык.')).not.toBeInTheDocument()

    await user.click(ru())
    expect(next()).toBeDisabled()
    expect(screen.getByText('Отметьте хотя бы один язык.')).toBeInTheDocument()
    await user.click(next())
    expect(onChoose).not.toHaveBeenCalled()

    await user.click(ua())
    expect(next()).toBeEnabled()
    expect(screen.queryByText('Отметьте хотя бы один язык.')).not.toBeInTheDocument()
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

    await user.click(next())

    expect(next()).toBeDisabled()
    expect(ru()).toBeDisabled()
    await user.click(next())
    expect(onChoose).toHaveBeenCalledTimes(1)

    finish()
  })

  it('stays up with an error and lets the learner retry when saving fails', async () => {
    const user = userEvent.setup()
    const onChoose = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined)
    render(<LangProfileScreen onChoose={onChoose} />)

    await user.click(by())
    await user.click(next())

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить выбор')
    // The ticks survive and the button is live again.
    expect(ru()).toBeChecked()
    expect(by()).toBeChecked()
    expect(next()).toBeEnabled()

    await user.click(next())
    await waitFor(() => expect(onChoose).toHaveBeenCalledTimes(2))
    expect(onChoose).toHaveBeenLastCalledWith(['ru', 'by'])
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
