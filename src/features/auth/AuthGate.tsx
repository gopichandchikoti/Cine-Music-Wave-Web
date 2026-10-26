import { content as copy } from '../../content.js'
import { useEffect, useState, type FormEvent } from 'react'
import { Film, Eye, EyeOff, ArrowUpRight, LoaderCircle } from '../../components/icons'
import { SiteFooter } from '../../components/SiteFooter'
import { authRequest, fetchAuthConfig, login, oauthStart } from '../../api'
import type { AccountSession, AuthConfig, AuthView } from './authTypes'
import { AuthMascot, type MascotState } from './AuthMascot'
import { signupError, usernamePolicy } from './authValidation'
const blank = { firstName: '', lastName: '', username: '', email: '', password: '', confirmPassword: '', identifier: '' }
export function AuthGate({ onSession, onGuest }: { onSession: (session: AccountSession) => void; onGuest?: () => void }) {
  const [config, setConfig] = useState<AuthConfig | null>(null),
    [view, setView] = useState<AuthView>('sign-in'),
    [form, setForm] = useState(blank),
    [show, setShow] = useState(false),
    [state, setState] = useState<MascotState>('idle'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null),
    [linkToken, setLinkToken] = useState<string | null>(null)
  useEffect(() => {
    void fetchAuthConfig()
      .then(setConfig)
      .catch(() => setError(copy.authGate.theSignInServiceCouldNotBeReachedReloadTo))
    const params = new URLSearchParams(location.hash.slice(1))
    const reset = params.get('reset-password'),
      verify = params.get('verify-email'),
      providerError = params.get('auth-error')
    if (reset || verify) {
      queueMicrotask(() => {
        setLinkToken(reset ?? verify)
        setView(reset ? 'reset-password' : 'verify-email')
      })
    }
    if (providerError)
      queueMicrotask(() =>
        setError(
          providerError === 'link-required'
            ? copy.authGate.signInToYourExistingAccountThenLinkThisProvider
            : copy.authGate.providerSignInCouldNotBeVerifiedTryAgain,
        ),
      )
    if (reset || verify || providerError) history.replaceState(null, '', location.pathname + location.search)
  }, [])
  const switchView = (next: AuthView) => {
    setView(next)
    setForm(blank)
    setError(null)
    setMessage(null)
    setShow(false)
    setState('idle')
  }
  const field = (key: keyof typeof blank, label: string, type = 'text', autoComplete?: string) => (
    <label className="account-field" key={key}>
      {label}
      <span className="account-input">
        <input
          name={key}
          type={type === 'password' && show ? 'text' : type}
          value={form[key]}
          autoComplete={autoComplete}
          required
          maxLength={key === 'password' || key === 'confirmPassword' ? 128 : key === 'email' || key === 'identifier' ? 254 : 50}
          onFocus={() => setState(type === 'password' ? 'password' : key === 'email' ? 'email' : 'username')}
          onBlur={() => setState('ready')}
          onChange={(event) => {
            setForm({ ...form, [key]: event.target.value })
            setError(null)
            if (state === 'error') setState('idle')
          }}
        />
        {key === 'password' && (
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShow(!show)}
            aria-label={show ? copy.authGate.hidePassword : copy.authGate.showPassword}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </span>
    </label>
  )
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setMessage(null)
    if (view === 'sign-up') {
      const problem = signupError(form)
      if (problem) {
        setError(problem)
        setState('error')
        return
      }
    }
    setBusy(true)
    try {
      if (config?.mode === 'owner') {
        onSession(await login(form.password))
        return
      }
      if (view === 'sign-in' || view === 'sign-up') {
        const session = await authRequest<AccountSession>(
          view === 'sign-in' ? '/auth/login' : '/auth/signup',
          'POST',
          view === 'sign-in' ? { identifier: form.identifier, password: form.password } : form,
        )
        setState('success')
        setForm(blank)
        onSession(session)
      } else if (view === 'forgot-password') {
        const result = await authRequest<{ message: string }>('/auth/forgot-password', 'POST', { email: form.email })
        setMessage(result.message)
      } else if (view === 'verify-email') {
        const result = await authRequest<{ message: string }>('/auth/verify-email', 'POST', { token: linkToken })
        setMessage(result.message)
        setLinkToken(null)
        setState('success')
      } else {
        const result = await authRequest<{ message: string }>('/auth/reset-password', 'POST', {
          token: linkToken,
          password: form.password,
          confirmPassword: form.confirmPassword,
        })
        setMessage(result.message)
        setForm(blank)
        setLinkToken(null)
        setState('success')
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : copy.authGate.theAccountRequestFailed)
      setState('error')
    } finally {
      setBusy(false)
    }
  }
  const provider = async (name: 'google' | 'microsoft' | 'facebook') => {
    setBusy(true)
    setError(null)
    try {
      location.assign(await oauthStart(name))
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : copy.authGate.providerSignInIsUnavailable)
      setState('error')
      setBusy(false)
    }
  }
  const title =
    view === 'sign-up'
      ? copy.authGate.makeRoomForDiscovery
      : view === 'forgot-password'
        ? copy.authGate.findYourWayBack
        : view === 'reset-password'
          ? copy.authGate.aFreshStart
          : view === 'verify-email'
            ? copy.authGate.confirmYourEmail
            : copy.authGate.welcomeToYourSecondBrain
  const owner = config?.mode === 'owner'
  return (
    <main className="account-shell">
      <section className="account-story">
        <a className="account-brand" href="/">
          <span className="brand-mark">
            <Film size={22} />
          </span>
          <span>
            {copy.authGate.secondBrain}
            <small>{copy.authGate.studyLibrary}</small>
          </span>
        </a>
        <p className="eyebrow">{copy.authGate.yourCuriosityCollected}</p>
        <h1>
          {copy.authGate.smallDiscoveries}
          <br />
          {copy.authGate.lastingUnderstanding}
        </h1>
        <p>{copy.authGate.yourNotesYourNextIdeaAndAQuietPlaceTo}</p>
        <AuthMascot state={state} />
      </section>
      <section className="account-form-area" aria-label={copy.authGate.yourAccount}>
        <div className="account-form-heading">
          <span className="eyebrow">
            {owner
              ? copy.authGate.localOwnerAccess
              : view === 'sign-up'
                ? copy.authGate.createAccount
                : copy.authGate.welcomeBack}
          </span>
          <h2>{owner ? copy.authGate.unlockYourPrivateLibrary : title}</h2>
          <p>
            {owner
              ? copy.authGate.thisDeploymentUsesADeliberateSharedOwnerPassword
              : copy.authGate.pickUpWhereYourCuriosityLeftOff}
          </p>
        </div>
        {error && (
          <p className="account-notice is-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="account-notice" role="status">
            {message}
          </p>
        )}
        <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
          {!owner && view === 'sign-up' && (
            <>
              <div className="account-name-row">
                {field('firstName', copy.authGate.firstName, 'text', 'given-name')}
                {field('lastName', copy.authGate.lastName, 'text', 'family-name')}
              </div>
              {field('username', copy.authGate.username, 'text', 'username')}
              <small>{usernamePolicy}</small>
              {field('email', copy.authGate.email, 'email', 'email')}
            </>
          )}
          {!owner && view === 'sign-in' && field('identifier', copy.authGate.emailOrUsername, 'text', 'username')}
          {!owner && view === 'forgot-password' && field('email', copy.authGate.email, 'email', 'email')}
          {(owner || ['sign-in', 'sign-up', 'reset-password'].includes(view)) &&
            field('password', copy.authGate.password, 'password', view === 'sign-in' ? 'current-password' : 'new-password')}
          {!owner && ['sign-up', 'reset-password'].includes(view) && (
            <>
              {field('confirmPassword', copy.authGate.confirmPassword, 'password', 'new-password')}
              <small>{copy.authGate.text15128CharactersALongUniquePassphraseWorksWell}</small>
            </>
          )}
          {view === 'verify-email' && <p>{copy.authGate.confirmTheSingleUseLinkFromYourVerificationEmail}</p>}
          <button
            className="account-primary"
            disabled={busy || !config || ((view === 'reset-password' || view === 'verify-email') && !linkToken)}
          >
            {busy ? <LoaderCircle size={17} className="spin-icon" /> : <ArrowUpRight size={17} />}{' '}
            {owner
              ? copy.authGate.unlockLibrary
              : view === 'sign-up'
                ? copy.authGate.createAccount2
                : view === 'forgot-password'
                  ? copy.authGate.sendResetLink
                  : view === 'reset-password'
                    ? copy.authGate.updatePassword
                    : view === 'verify-email'
                      ? copy.authGate.verifyEmail
                      : copy.authGate.signIn}
          </button>
        </form>
        {!owner && view === 'sign-in' && (
          <>
            <button className="account-text-button" type="button" onClick={() => switchView('forgot-password')}>
              {copy.authGate.forgotPassword}
            </button>
            <div className="account-divider">
              <span>{copy.authGate.orContinueWith}</span>
            </div>
            <div className="account-providers">
              {config?.providers
                .filter((item) => item.enabled || config.development)
                .map((item) => (
                  <button
                    type="button"
                    key={item.provider}
                    disabled={!item.enabled || busy}
                    onClick={() => void provider(item.provider)}
                    aria-label={copy.authGate.continueWith + item.provider}
                  >
                    <span className={'provider-symbol provider-' + item.provider} aria-hidden="true">
                      {item.provider === 'google' ? 'G' : item.provider === 'microsoft' ? '▦' : 'f'}
                    </span>
                    <span>
                      {item.provider[0].toUpperCase() + item.provider.slice(1)}
                      {!item.enabled && <small>{copy.authGate.notConfigured}</small>}
                    </span>
                  </button>
                ))}
            </div>
            <p className="account-alternate">
              {copy.authGate.newHere}
              <button type="button" disabled={!config?.signupEnabled} onClick={() => switchView('sign-up')}>
                {copy.authGate.createAnAccount}
              </button>
            </p>
          </>
        )}
        {!owner && view !== 'sign-in' && (
          <button type="button" className="account-text-button" onClick={() => switchView('sign-in')}>
            {copy.authGate.backToSignIn}
          </button>
        )}
        {onGuest && (owner || view === 'sign-in' || view === 'sign-up') && (
          <div className="account-guest">
            <div className="account-divider">
              <span>{copy.authGate.or}</span>
            </div>
            <button type="button" className="account-guest-button" onClick={onGuest}>
              {copy.authGate.continueAsGuest}
            </button>
            <small>{copy.authGate.previewTheAppAndTryTheMarkdownEditorWithoutAn}</small>
          </div>
        )}
        {config && !config.emailDelivery && !owner && (
          <p className="account-local-note">{copy.authGate.localModeEmailDeliveryIsNotConfiguredVerificationAndPassword}</p>
        )}
        <footer className="account-footer">
          {copy.authGate.passwordsAreHashedProviderPasswordsStayWithTheProvider}
          <br />
          {copy.authGate.yourLearningLibraryAtYourOwnPace}
          <SiteFooter inline />
        </footer>
      </section>
    </main>
  )
}
