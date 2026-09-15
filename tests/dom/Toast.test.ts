// Author: gurvinny
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Toast } from '../../src/ui/Toast'
import { mountFixture, resetDom } from '../helpers/dom'

// Toast resolves its four elements in field initializers, which run before the
// constructor body -- the fixture has to be in the document before `new`.
function build(): { toast: Toast; el: HTMLElement } {
  const el = mountFixture('#toast')
  return { toast: new Toast(), el }
}

const msg = () => document.querySelector('.toast-msg') as HTMLElement
const action = () => document.querySelector('.toast-action') as HTMLButtonElement
const close = () => document.querySelector('.toast-close') as HTMLButtonElement

describe('Toast', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); resetDom() })

  it('throws when the banner markup is missing rather than silently doing nothing', () => {
    // The non-null assertion on getElementById means a missing #toast surfaces
    // as a TypeError here instead of a confusing no-op later.
    expect(() => new Toast()).toThrow()
  })

  it('shows the message and reveals the banner', () => {
    const { toast, el } = build()
    toast.show({ message: 'Rendering stalled' })

    expect(msg().textContent).toBe('Rendering stalled')
    expect(el.classList.contains('toast--visible')).toBe(true)
    expect(el.getAttribute('aria-hidden')).toBe('false')
  })

  it('hides the action button when no actionLabel is given', () => {
    const { toast } = build()
    toast.show({ message: 'no action' })

    expect(action().style.display).toBe('none')
    expect(action().textContent).toBe('')
  })

  it('shows the action button with its label when one is given', () => {
    const { toast } = build()
    toast.show({ message: 'Install?', actionLabel: 'Install' })

    // Cleared back to '' rather than a specific value, so the stylesheet keeps
    // deciding how a visible action is laid out.
    expect(action().style.display).toBe('')
    expect(action().textContent).toBe('Install')
  })

  it('stays visible with no duration, and auto-dismisses with one', () => {
    const { toast, el } = build()

    toast.show({ message: 'sticky' })
    vi.advanceTimersByTime(60_000)
    expect(el.classList.contains('toast--visible')).toBe(true)

    toast.show({ message: 'transient', duration: 4000 })
    vi.advanceTimersByTime(3999)
    expect(el.classList.contains('toast--visible')).toBe(true)
    vi.advanceTimersByTime(1)
    expect(el.classList.contains('toast--visible')).toBe(false)
    expect(el.getAttribute('aria-hidden')).toBe('true')
  })

  it('cancels a pending auto-dismiss when a second toast replaces the first', () => {
    const { toast, el } = build()
    toast.show({ message: 'first', duration: 1000 })
    toast.show({ message: 'second' })

    // Without clearTimer the first toast's timer would fire and hide the second.
    vi.advanceTimersByTime(5000)
    expect(el.classList.contains('toast--visible')).toBe(true)
    expect(msg().textContent).toBe('second')
  })

  it('hides before invoking the action callback', () => {
    const { toast, el } = build()
    let visibleWhenCalled: boolean | null = null
    toast.show({
      message: 'Install?',
      actionLabel: 'Install',
      onAction: () => { visibleWhenCalled = el.classList.contains('toast--visible') },
    })

    action().click()

    // The handler captures the callback, hides, then calls -- so a callback that
    // opens a dialog or shows another toast is not fighting this one on the way
    // out. Asserting the ordering, not just that the callback ran.
    expect(visibleWhenCalled).toBe(false)
  })

  it('drops the action callback on dismiss so a stale one cannot fire twice', () => {
    const { toast } = build()
    let calls = 0
    toast.show({ message: 'Install?', actionLabel: 'Install', onAction: () => { calls++ } })

    action().click()
    action().click()

    expect(calls).toBe(1)
  })

  it('dismisses on the close button without running the action', () => {
    const { toast, el } = build()
    let ran = false
    toast.show({ message: 'Install?', actionLabel: 'Install', onAction: () => { ran = true } })

    close().click()

    expect(el.classList.contains('toast--visible')).toBe(false)
    expect(ran).toBe(false)
  })
})
