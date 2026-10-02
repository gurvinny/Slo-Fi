// Author: gurvinny
//
// formatTime feeds the transport readout, the playlist rows and the track meta
// line, so one bad branch shows up in three places at once.
import { describe, it, expect } from 'vitest'
import { formatTime } from '../../src/ui/time'

describe('formatTime', () => {
  it('zero-pads the minutes so the readout keeps a fixed width', () => {
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(5)).toBe('00:05')
    expect(formatTime(84)).toBe('01:24')
    expect(formatTime(225)).toBe('03:45')
    expect(formatTime(599)).toBe('09:59')
    expect(formatTime(600)).toBe('10:00')
  })

  it('floors partial seconds rather than rounding up past the real position', () => {
    expect(formatTime(59.999)).toBe('00:59')
    expect(formatTime(84.7)).toBe('01:24')
  })

  it('switches to h:mm:ss at one hour instead of counting minutes past 59', () => {
    expect(formatTime(3599)).toBe('59:59')
    expect(formatTime(3600)).toBe('1:00:00')
    expect(formatTime(3725)).toBe('1:02:05')
    expect(formatTime(36000 + 61)).toBe('10:01:01')
  })

  it('renders an unknown or invalid duration as zero, never as NaN', () => {
    // An AudioBuffer that has not decoded yet reports NaN, and a seek that
    // overshoots can briefly go negative.
    expect(formatTime(Number.NaN)).toBe('00:00')
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('00:00')
    expect(formatTime(-3)).toBe('00:00')
  })
})
