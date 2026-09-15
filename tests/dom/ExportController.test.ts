// Author: gurvinny
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mountFixture, resetDom } from '../helpers/dom'

// The real export path builds an OfflineAudioContext and renders audio, which
// jsdom has none of. What this suite owns is the button/status state machine
// around the call; that the render itself is correct is the browser suite's job
// (tests/browser/Exporter.test.ts).
const exportAudio = vi.fn<(engine: unknown, trackName: string) => Promise<void>>()
vi.mock('../../src/audio/Exporter', () => ({
  exportAudio: (engine: unknown, trackName: string) => exportAudio(engine, trackName),
}))

const { ExportController } = await import('../../src/ui/ExportController')
type Engine = { hasBuffer: boolean }

function build(engine: Engine) {
  mountFixture('.export-panel')
  // Fields are resolved in initializers, so the fixture must already be mounted.
  const controller = new ExportController(engine as never)
  return {
    controller,
    btn: document.getElementById('exportBtn') as HTMLButtonElement,
    status: document.getElementById('exportStatus') as HTMLElement,
  }
}

describe('ExportController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    exportAudio.mockReset()
    exportAudio.mockResolvedValue(undefined)
  })
  afterEach(() => { vi.useRealTimers(); resetDom(); vi.restoreAllMocks() })

  it('does nothing at all when no track is loaded', async () => {
    const { btn, status } = build({ hasBuffer: false })
    btn.click()
    await vi.runAllTimersAsync()

    // Not merely "did not export" -- the status text must stay empty too, or a
    // user with no track sees a Rendering message that never resolves.
    expect(exportAudio).not.toHaveBeenCalled()
    expect(status.textContent).toBe('')
    expect(btn.disabled).toBe(false)
  })

  it('forwards the current track name to the exporter', async () => {
    const engine = { hasBuffer: true }
    const { controller, btn } = build(engine)
    controller.trackName = 'midnight-drive'

    btn.click()
    await vi.runAllTimersAsync()

    expect(exportAudio).toHaveBeenCalledWith(engine, 'midnight-drive')
  })

  it('defaults the track name before App.ts sets one', () => {
    const { controller } = build({ hasBuffer: true })
    expect(controller.trackName).toBe('slo-fi-export')
  })

  it('disables the button while rendering and re-enables it after', async () => {
    let release: (() => void) | undefined
    exportAudio.mockImplementation(() => new Promise<void>((res) => { release = () => res() }))

    const { btn, status } = build({ hasBuffer: true })
    btn.click()
    await Promise.resolve()

    expect(btn.disabled).toBe(true)
    expect(status.textContent).toBe('Rendering...')

    release!()
    await vi.runAllTimersAsync()
    expect(btn.disabled).toBe(false)
  })

  it('reports success, then clears the status after three seconds', async () => {
    const { btn, status } = build({ hasBuffer: true })
    btn.click()
    await Promise.resolve(); await Promise.resolve()

    expect(status.textContent).toBe('Done')

    await vi.advanceTimersByTimeAsync(2999)
    expect(status.textContent).toBe('Done')
    await vi.advanceTimersByTimeAsync(1)
    expect(status.textContent).toBe('')
  })

  it('reports a failure instead of leaving the button stuck', async () => {
    // A render that throws used to be the worst case: the button stayed
    // disabled and the user had no way to retry. The finally block is the fix,
    // so it is what this asserts.
    exportAudio.mockRejectedValue(new Error('decode failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { btn, status } = build({ hasBuffer: true })
    btn.click()
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()

    expect(status.textContent).toBe('Export failed')
    expect(btn.disabled).toBe(false)

    await vi.advanceTimersByTimeAsync(3000)
    expect(status.textContent).toBe('')
  })
})
