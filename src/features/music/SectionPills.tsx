import type { ComponentType } from 'react'
import { useSlidingIndicator } from '../../hooks/useSlidingIndicator'

export type Section<Id extends string> = { id: Id; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> }

/**
 * A row of section buttons, as in the new Library: the chosen section is a pill with its icon and name, the others are round buttons with
 * only an icon (the name is their label and tooltip). The accent highlight slides to the chosen one on the snappy spring.
 */
export function SectionPills<Id extends string>({
  sections,
  value,
  onChange,
  label,
}: {
  sections: readonly Section<Id>[]
  value: Id
  onChange: (id: Id) => void
  label: string
}) {
  const indicator = useSlidingIndicator<HTMLDivElement>(
    'library-sections',
    Math.max(
      0,
      sections.findIndex((entry) => entry.id === value),
    ),
  )
  return (
    <div className="music-pills" role="tablist" aria-label={label} ref={indicator}>
      {sections.map((section) => {
        const on = section.id === value
        const Icon = section.icon
        return (
          <button
            key={section.id}
            className={`music-pill-tab ${on ? 'is-on' : ''}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={section.label}
            title={section.label}
            onClick={() => onChange(section.id)}
          >
            <Icon size={20} strokeWidth={2.2} />
            {on && <span>{section.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
