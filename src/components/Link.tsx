import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { navigate } from '../routes'

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string }

const isPlainLeftClick = (event: MouseEvent<HTMLAnchorElement>): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

/** An ordinary link that moves inside the app without a reload. Modified clicks still open a new tab. */
export function Link({ to, onClick, children, ...props }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(event)
    if (event.defaultPrevented || !isPlainLeftClick(event) || props.target === '_blank') return
    event.preventDefault()
    navigate(to)
  }
  return (
    <a href={to} onClick={handleClick} {...props}>
      {children}
    </a>
  )
}
