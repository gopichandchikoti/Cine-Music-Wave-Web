import { content as copy } from '../../content.js'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { authRequest, fetchAuthConfig, oauthStart, accountUrl } from '../../api'
import type { PublicUser, AuthConfig, OAuthProvider } from './authTypes'
import { usernamePolicy } from './authValidation'
export function ProfileView({
  user,
  onUser,
  onClose,
  onSignedOut,
}: {
  user: PublicUser
  onUser: (user: PublicUser) => void
  onClose: () => void
  onSignedOut: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [form, setForm] = useState({
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      phoneNumber: user.phoneNumber ?? '',
    }),
    [secret, setSecret] = useState({ currentPassword: '', password: '', confirmPassword: '' }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null),
    [config, setConfig] = useState<AuthConfig | null>(null),
    [avatarVersion, setAvatarVersion] = useState(0)
  useEffect(() => {
    dialog.current?.showModal()
    void fetchAuthConfig()
      .then(setConfig)
      .catch(() => setError(copy.profileView.providerConfigurationIsUnavailable))
    const current = dialog.current
    return () => current?.close()
  }, [])
  const action = async (run: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await run()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : copy.profileView.theAccountRequestFailed)
    } finally {
      setBusy(false)
    }
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    void action(async () => {
      onUser(await authRequest<PublicUser>('/profile', 'PATCH', form))
      setMessage(copy.profileView.profileSaved)
    })
  }
  const upload = (file: File | undefined) => {
    if (!file) return
    if (file.type !== 'image/png' || file.size > 512 * 1024) {
      setError(copy.profileView.chooseAPngNoLargerThan512Kb)
      return
    }
    void action(async () => {
      const buffer = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      for (let start = 0; start < buffer.length; start += 8192)
        binary += String.fromCharCode(...buffer.subarray(start, start + 8192))
      onUser(await authRequest<PublicUser>('/profile/avatar', 'POST', { mimeType: file.type, data: btoa(binary) }))
      setAvatarVersion((value) => value + 1)
      setMessage(copy.profileView.avatarSaved)
    })
  }
  const link = (provider: OAuthProvider) => void action(async () => location.assign(await oauthStart(provider, 'link')))
  return (
    <dialog ref={dialog} className="account-dialog" aria-labelledby="profile-heading" onCancel={onClose}>
      <div className="account-dialog-heading">
        <h2 id="profile-heading">{copy.profileView.myProfile}</h2>
        <button type="button" onClick={onClose} aria-label={copy.profileView.closeProfile}>
          {copy.profileView.close}
        </button>
      </div>
      {error && (
        <p role="alert" className="account-notice is-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="account-notice">
          {message}
        </p>
      )}
      <form onSubmit={save}>
        <div className="account-name-row">
          {(['firstName', 'lastName'] as const).map((key) => (
            <label key={key}>
              {key === 'firstName' ? copy.profileView.firstName : copy.profileView.lastName}
              <input
                value={form[key]}
                required
                maxLength={50}
                autoComplete={key === 'firstName' ? 'given-name' : 'family-name'}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })}
              />
            </label>
          ))}
        </div>
        <label>
          {copy.profileView.username}
          <input
            value={form.username}
            required
            maxLength={24}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
          />
          <small>{usernamePolicy}</small>
        </label>
        <label>
          {copy.profileView.phoneOptional}
          <input
            type="tel"
            autoComplete="tel"
            placeholder={copy.profileView.text447700900123}
            value={form.phoneNumber}
            maxLength={25}
            onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })}
          />
          <small>{copy.profileView.includeTheInternationalCountryCodeTheServerValidatesTheNumber}</small>
        </label>
        <p>
          {copy.profileView.email}
          {user.email}
          <br />
          {user.emailVerified ? copy.profileView.verified : copy.profileView.notVerified}
          {copy.profileView.created}
          {new Date(user.createdAt).toLocaleDateString(copy.locale)}
        </p>
        {!user.emailVerified && (
          <button
            type="button"
            disabled={busy || !config?.emailDelivery}
            onClick={() =>
              void action(async () => {
                const result = await authRequest<{ message: string }>('/auth/resend-verification', 'POST', {})
                setMessage(result.message)
              })
            }
          >
            {config?.emailDelivery
              ? copy.profileView.sendVerificationEmail
              : copy.profileView.emailVerificationUnavailableInLocalMode}
          </button>
        )}
        <div className="account-dialog-actions">
          <button className="account-primary" disabled={busy}>
            {copy.profileView.saveProfile}
          </button>
          <button type="button" onClick={onClose}>
            {copy.profileView.cancel}
          </button>
        </div>
      </form>
      <h3>{copy.profileView.avatar}</h3>
      {user.avatarUrl && (
        <img
          src={accountUrl(user.avatarUrl) + '&v=' + avatarVersion}
          width={72}
          height={72}
          alt={copy.profileView.yourSavedAvatar}
        />
      )}
      <label>
        {copy.profileView.uploadPng}
        <input type="file" accept="image/png" disabled={busy} onChange={(event) => upload(event.target.files?.[0])} />
        <small>{copy.profileView.staticNonInterlaced8BitPng16512PixelsPer}</small>
      </label>
      {user.avatarUrl && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void action(async () => {
              onUser(await authRequest<PublicUser>('/profile/avatar', 'DELETE', {}))
              setMessage(copy.profileView.avatarRemoved)
            })
          }
        >
          {copy.profileView.removeAvatar}
        </button>
      )}
      <h3>{copy.profileView.signInMethods}</h3>
      <p>{copy.profileView.linkProvidersOnlyAfterARecentSignInAccountsAre}</p>
      {user.providers.map((provider) => (
        <div className="account-provider-row" key={provider}>
          <span>
            {provider}
            {copy.profileView.linked}
          </span>
          {provider !== 'password' && (
            <button
              type="button"
              disabled={busy || user.providers.length < 2}
              onClick={() =>
                void action(async () => {
                  await authRequest('/profile/providers/' + provider, 'DELETE', { currentPassword: secret.currentPassword })
                  onSignedOut()
                })
              }
            >
              {copy.profileView.remove}
            </button>
          )}
        </div>
      ))}
      {config?.providers
        .filter((item) => item.enabled && !user.providers.includes(item.provider))
        .map((item) => (
          <button key={item.provider} type="button" disabled={busy} onClick={() => link(item.provider)}>
            {copy.profileView.link}
            {item.provider}
          </button>
        ))}
      <h3>{user.providers.includes('password') ? copy.profileView.changePassword : copy.profileView.addAPassword}</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void action(async () => {
            await authRequest('/profile/password', 'POST', secret)
            setSecret({ currentPassword: '', password: '', confirmPassword: '' })
            onSignedOut()
          })
        }}
      >
        {user.providers.includes('password') && (
          <label>
            {copy.profileView.currentPassword}
            <input
              type="password"
              autoComplete="current-password"
              value={secret.currentPassword}
              maxLength={128}
              required
              onChange={(event) => setSecret({ ...secret, currentPassword: event.target.value })}
            />
          </label>
        )}
        <label>
          {copy.profileView.newPassword}
          <input
            type="password"
            autoComplete="new-password"
            value={secret.password}
            minLength={15}
            maxLength={128}
            required
            onChange={(event) => setSecret({ ...secret, password: event.target.value })}
          />
        </label>
        <label>
          {copy.profileView.confirmNewPassword}
          <input
            type="password"
            autoComplete="new-password"
            value={secret.confirmPassword}
            minLength={15}
            maxLength={128}
            required
            onChange={(event) => setSecret({ ...secret, confirmPassword: event.target.value })}
          />
        </label>
        <button className="account-primary" disabled={busy}>
          {copy.profileView.updatePasswordAndSignOut}
        </button>
      </form>
    </dialog>
  )
}
