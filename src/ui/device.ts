// Device-class predicates. One definition of each question the UI asks about
// the machine it is running on.
// Author: gurvinny
//
// The regex below used to exist as four verbatim copies -- App, SplashController,
// MobileController and AnomalySphere -- and the one file that needed a device
// check, InstallController, had none. That is the shape of the bug: duplication
// hides omission, because nothing about four identical copies tells you a fifth
// is missing.
//
// There are deliberately TWO predicates, because the four callers are not all
// asking the same thing:
//
//   isMobileUserAgent() -- the PLATFORM. Is this iOS or Android? Decides the
//     renderer's budget (particle count, MSAA, pixel ratio, frame cap) and
//     whether the AudioContext suspends when the page is hidden. Both are
//     properties of the OS and the GPU, not of the input device.
//
//   isMobileDevice()    -- the FORM FACTOR. Should this get mobile UI
//     affordances? Platform OR a coarse pointer, because an Android tablet
//     requesting the desktop site sends a desktop user agent and is still a
//     device where "Add to Home Screen" is the right offer.
//
// Reach for the narrower one. Handing a coarse-pointer desktop the mobile
// renderer tier is a silent regression: it still draws, still animates, and
// still passes every test that asks whether a frame appeared.

/**
 * iOS or Android, by user agent.
 *
 * Read on every call rather than captured at module load, so a test can stub
 * the user agent without having to beat the import to it.
 */
export function isMobileUserAgent(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

/**
 * A primary pointing device that is imprecise -- touch or stylus.
 *
 * Answers false where matchMedia is missing (jsdom, some embedded webviews)
 * rather than throwing, since the callers include a renderer constructor.
 */
export function isCoarsePointer(): boolean {
  try {
    return window.matchMedia?.('(pointer: coarse)').matches === true
  } catch {
    return false
  }
}

/**
 * A device that should get mobile UI affordances.
 *
 * The OR is load-bearing in both directions: the user agent catches a phone
 * plugged into a mouse, and the pointer catches a tablet in desktop mode.
 */
export function isMobileDevice(): boolean {
  return isMobileUserAgent() || isCoarsePointer()
}
