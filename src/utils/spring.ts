/**
 * Apple-style springs. A spring is described by how long it takes to arrive (`response`, in seconds) and how much it
 * overshoots (`dampingFraction`: 1 arrives without overshoot, 0.7 overshoots a little, 0 never settles). These are the
 * same two numbers SwiftUI's `.spring(response:dampingFraction:)` takes, so a value tuned on iOS carries over directly.
 *
 * Physics (mass 1): stiffness k = (2π / response)², damping c = 4π × dampingFraction / response.
 */

export type SpringSpec = { response: number; dampingFraction: number }

export const SPRINGS = {
  /** Tab indicators, toggles, small state changes. A touch of overshoot, settles fast. */
  snappy: { response: 0.32, dampingFraction: 0.86 },
  /** Sheets, page and mode changes, minimise and expand. No overshoot. */
  smooth: { response: 0.5, dampingFraction: 1 },
  /** Menus, popovers and dialogs appearing. Clearly overshoots, then rests. */
  bouncy: { response: 0.45, dampingFraction: 0.7 },
} as const satisfies Record<string, SpringSpec>

export type SpringName = keyof typeof SPRINGS

/** Spring constants for a spec, for libraries that take `stiffness` and `damping` (Reanimated, Compose, UIKit). */
export const springConstants = ({ response, dampingFraction }: SpringSpec): { mass: 1; stiffness: number; damping: number } => ({
  mass: 1,
  stiffness: (2 * Math.PI) ** 2 / response ** 2,
  damping: (4 * Math.PI * dampingFraction) / response,
})

/** SwiftUI's `Spring(duration:bounce:)` expressed as a spec: the duration is the response, damping is `1 - bounce`. */
export const fromDurationAndBounce = (duration: number, bounce: number): SpringSpec => ({
  response: duration,
  dampingFraction: Math.min(1, Math.max(0, 1 - bounce)),
})

/** Position of a spring released from rest at 0 and pulled towards 1, `seconds` after the release. */
export function springPosition(spec: SpringSpec, seconds: number): number {
  const omega = (2 * Math.PI) / spec.response
  const zeta = spec.dampingFraction
  if (seconds <= 0) return 0
  if (zeta >= 1) return 1 - Math.exp(-omega * seconds) * (1 + omega * seconds)
  const damped = omega * Math.sqrt(1 - zeta * zeta)
  const decay = Math.exp(-zeta * omega * seconds)
  return 1 - decay * (Math.cos(damped * seconds) + ((zeta * omega) / damped) * Math.sin(damped * seconds))
}

/** The first moment after which the spring stays within `tolerance` of its target. */
export function settlingTime(spec: SpringSpec, tolerance = 0.005): number {
  const step = 0.004
  let last = 0
  for (let time = 0; time < 5; time += step) if (Math.abs(springPosition(spec, time) - 1) > tolerance) last = time
  return last + step
}

/**
 * A CSS `linear()` easing that follows the spring, plus how long it lasts. `linear()` takes evenly spaced samples, so
 * the curve can overshoot 1 and come back, which a cubic-bezier cannot do.
 */
export function springEasing(spec: SpringSpec, samples = 48): { easing: string; durationMs: number } {
  const duration = settlingTime(spec)
  const points = Array.from({ length: samples + 1 }, (_, index) => {
    const value = index === samples ? 1 : springPosition(spec, (duration * index) / samples)
    return Number(value.toFixed(4))
  })
  return { easing: `linear(${points.join(', ')})`, durationMs: Math.round(duration * 1000) }
}
