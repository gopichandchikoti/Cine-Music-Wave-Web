import { content as copy } from '../../content.js'
export type MascotState = 'idle' | 'username' | 'email' | 'password' | 'ready' | 'error' | 'success'
export function AuthMascot({ state }: { state: MascotState }) {
  return (
    <div className={'auth-mascot mascot-' + state} aria-hidden="true">
      <svg viewBox="0 0 300 300" focusable="false">
        <ellipse className="mascot-shadow" cx="150" cy="264" rx="92" ry="13" />
        <path className="mascot-body" d="M77 262v-51c0-58 146-58 146 0v51" />
        <circle className="mascot-ear" cx="74" cy="74" r="32" />
        <circle className="mascot-ear" cx="226" cy="74" r="32" />
        <circle className="mascot-ear-inner" cx="74" cy="74" r="19" />
        <circle className="mascot-ear-inner" cx="226" cy="74" r="19" />
        <rect className="mascot-face" x="54" y="55" width="192" height="162" rx="78" />
        <ellipse className="mascot-muzzle" cx="150" cy="159" rx="43" ry="32" />
        <g className="mascot-eyes">
          <ellipse cx="111" cy="125" rx="6" ry="8" />
          <ellipse cx="189" cy="125" rx="6" ry="8" />
        </g>
        <path className="mascot-nose" d="M139 150q11-9 22 0l-11 12z" />
        <path className="mascot-smile" d="M137 171q13 14 26 0" fill="none" strokeWidth="4" strokeLinecap="round" />
        <circle className="mascot-cheek" cx="91" cy="155" r="12" />
        <circle className="mascot-cheek" cx="209" cy="155" r="12" />
        <path className="mascot-book" d="M109 216q22-8 41 4q19-12 41-4v43q-21-8-41 3q-20-11-41-3z" />
        <path className="mascot-book-line" d="M150 221v38" />
        <ellipse className="mascot-hand hand-left" cx="76" cy="220" rx="22" ry="30" />
        <ellipse className="mascot-hand hand-right" cx="224" cy="220" rx="22" ry="30" />
      </svg>
      <span className="mascot-caption">{copy.authMascot.aLittleSpaceForACuriousMind}</span>
    </div>
  )
}
