/**
 * `TrainingBlock` tests (`spec/tasks/32-training-setup-collapsible-blocks.md` §2/§4):
 * `aria-expanded` toggles with `open`, the collapsed body is genuinely absent from the DOM
 * (not just visually hidden), and — driven from a small accordion harness, the same
 * "openBlockId" pattern `TrainingSetupScreen` itself uses — opening a second block closes the
 * first.
 */
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrainingBlock } from './TrainingBlock.tsx'

afterEach(() => {
  cleanup()
})

describe('TrainingBlock', () => {
  it('starts collapsed with the body absent from the DOM, and expands on click', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <TrainingBlock id="a" title="Block A" summary="Summary A" open={open} onOpenChange={setOpen}>
          <button type="button">inside A</button>
        </TrainingBlock>
      )
    }
    render(<Harness />)

    const header = screen.getByRole('button', { name: /Block A/ })
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(header).not.toHaveAttribute('aria-controls')
    expect(screen.queryByText('inside A')).not.toBeInTheDocument()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()

    await user.click(header)

    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(header).toHaveAttribute('aria-controls', 'a')
    expect(screen.getByText('inside A')).toBeInTheDocument()
    expect(screen.getByRole('region')).toHaveAttribute('id', 'a')
  })

  it('accordion mode: opening a second block closes the first', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [openId, setOpenId] = useState<string | null>('a')
      return (
        <>
          <TrainingBlock
            id="a"
            title="Block A"
            summary="Summary A"
            open={openId === 'a'}
            onOpenChange={(open) => setOpenId(open ? 'a' : null)}
          >
            <p>content A</p>
          </TrainingBlock>
          <TrainingBlock
            id="b"
            title="Block B"
            summary="Summary B"
            open={openId === 'b'}
            onOpenChange={(open) => setOpenId(open ? 'b' : null)}
          >
            <p>content B</p>
          </TrainingBlock>
        </>
      )
    }
    render(<Harness />)

    expect(screen.getByText('content A')).toBeInTheDocument()
    expect(screen.queryByText('content B')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Block B/ }))

    expect(screen.queryByText('content A')).not.toBeInTheDocument()
    expect(screen.getByText('content B')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Block A/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: /Block B/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('collapsing the open block removes its controls from the DOM entirely', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <TrainingBlock id="a" title="Block A" summary="Summary A" open={open} onOpenChange={setOpen}>
          <button type="button">inside A</button>
        </TrainingBlock>
      )
    }
    render(<Harness />)

    expect(screen.getByRole('button', { name: 'inside A' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Block A/ }))

    expect(screen.queryByRole('button', { name: 'inside A' })).not.toBeInTheDocument()
  })
})
