import { Component, type ReactNode } from 'react'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
/** Long enough for the exit spring in themes/motion.css (240 ms) to finish. */
const DEFAULT_EXIT_MS = 260
const REDUCED_EXIT_MS = 80

type PresenceProps = {
  show: boolean
  exitMs?: number
  children: ReactNode
}

type PresenceState = {
  /** The children from the last render in which `show` was true: they stay on screen while the exit plays. */
  node: ReactNode
  phase: 'open' | 'exit' | 'gone'
}

/**
 * Keeps an overlay mounted while it animates away, so closing is as deliberate as opening.
 *
 * It renders `<div class="presence" data-presence="open|exit">` (no box of its own, see `.presence` in themes/motion.css).
 * CSS styles the exit with `[data-presence='exit'] .the-overlay { animation: ... }`. While leaving, the subtree is
 * `inert`, so it cannot be clicked or focused, and it shows the props it had at the last open render.
 *
 * This is a class because it derives state from props before rendering (`getDerivedStateFromProps`) and runs a timer from a
 * lifecycle method: the two things a hook cannot do without an extra render or a ref read during render.
 */
export class Presence extends Component<PresenceProps, PresenceState> {
  state: PresenceState = this.props.show ? { node: this.props.children, phase: 'open' } : { node: null, phase: 'gone' }
  private timer: number | undefined

  static getDerivedStateFromProps(props: PresenceProps, state: PresenceState): Partial<PresenceState> | null {
    if (props.show) return { node: props.children, phase: 'open' }
    return state.phase === 'open' ? { phase: 'exit' } : null
  }

  componentDidUpdate(_previousProps: PresenceProps, previousState: PresenceState): void {
    if (this.state.phase === 'open' && this.timer !== undefined) {
      window.clearTimeout(this.timer)
      this.timer = undefined
    }
    if (this.state.phase === 'exit' && previousState.phase !== 'exit') {
      this.scheduleRemoval()
    }
  }

  private scheduleRemoval(): void {
    // matchMedia is missing in some test environments; there, play the full exit.
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches
    const wait = reduced ? REDUCED_EXIT_MS : (this.props.exitMs ?? DEFAULT_EXIT_MS)
    this.timer = window.setTimeout(() => this.setState({ node: null, phase: 'gone' }), wait)
  }

  componentWillUnmount(): void {
    window.clearTimeout(this.timer)
  }

  render(): ReactNode {
    const { node, phase } = this.state
    if (phase === 'gone' || node === null || node === false) return null
    return (
      <div className="presence" data-presence={phase} inert={phase === 'exit'}>
        {node}
      </div>
    )
  }
}
