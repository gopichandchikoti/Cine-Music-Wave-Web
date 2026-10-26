import { content as copy } from '../../content.js'
import { useEffect, useRef, useState } from 'react'
import { authRequest } from '../../api'
import type { PublicUser, AccountSettings } from './authTypes'
export function SettingsView({
  user,
  onClose,
  onSignedOut,
  theme,
  readingScale,
  onPreferences,
}: {
  user: PublicUser
  onUser: (user: PublicUser) => void
  onClose: () => void
  onSignedOut: () => void
  theme: 'light' | 'dark'
  readingScale: 'standard' | 'large'
  onPreferences: (theme: 'light' | 'dark', scale: 'standard' | 'large') => void
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [settings, setSettings] = useState<AccountSettings | null>(null),
    [selectedTheme, setTheme] = useState(theme),
    [scale, setScale] = useState(readingScale),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    dialog.current?.showModal()
    void authRequest<AccountSettings>('/settings')
      .then(setSettings)
      .catch((problem) => setError(problem instanceof Error ? problem.message : copy.settingsView.settingsAreUnavailable))
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
      setError(problem instanceof Error ? problem.message : copy.settingsView.theSettingsRequestFailed)
    } finally {
      setBusy(false)
    }
  }
  const exportAccount = () =>
    void action(async () => {
      const value = await authRequest('/account/export', 'POST', { currentPassword: password, confirmation })
      const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
        url = URL.createObjectURL(blob),
        anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'cine-music-wave-account.json'
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setPassword('')
      setMessage(copy.settingsView.accountExportDownloadedStoreItPrivately)
    })
  return (
    <dialog ref={dialog} className="account-dialog" aria-labelledby="settings-heading" onCancel={onClose}>
      <div className="account-dialog-heading">
        <h2 id="settings-heading">{copy.settingsView.settings}</h2>
        <button type="button" onClick={onClose}>
          {copy.settingsView.close}
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
      <h3>{copy.settingsView.readingPreferences}</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void action(async () => {
            await authRequest('/settings', 'PATCH', { theme: selectedTheme, readingScale: scale })
            onPreferences(selectedTheme, scale)
            setMessage(copy.settingsView.preferencesSaved)
          })
        }}
      >
        <label>
          {copy.settingsView.theme}
          <select value={selectedTheme} onChange={(event) => setTheme(event.target.value as 'light' | 'dark')}>
            <option value="dark">{copy.settingsView.dark}</option>
            <option value="light">{copy.settingsView.light}</option>
          </select>
        </label>
        <label>
          {copy.settingsView.readingSize}
          <select value={scale} onChange={(event) => setScale(event.target.value as 'standard' | 'large')}>
            <option value="standard">{copy.settingsView.standard}</option>
            <option value="large">{copy.settingsView.large}</option>
          </select>
        </label>
        <button className="account-primary" disabled={busy}>
          {copy.settingsView.savePreferences}
        </button>
      </form>
      <h3>{copy.settingsView.activeSessions}</h3>
      <ul className="account-session-list">
        {settings?.sessions.map((session) => (
          <li key={session.id}>
            {session.current ? copy.settingsView.thisSession : copy.settingsView.anotherSession}
            {copy.settingsView.lastActive}
            {new Date(session.lastSeenAt).toLocaleString(copy.locale)}
            <br />
            {copy.settingsView.expires}
            {new Date(session.expiresAt).toLocaleString(copy.locale)}
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void action(async () => {
            await authRequest('/auth/logout-all', 'POST', {})
            onSignedOut()
          })
        }
      >
        {copy.settingsView.signOutOnAllDevices}
      </button>
      <h3>{copy.settingsView.privacyAndAccount}</h3>
      <p>
        {copy.settingsView.email}
        {user.emailVerified ? copy.settingsView.verified : copy.settingsView.notVerified}
        {copy.settingsView.signInMethods}
        {user.providers.join(', ')}
        {copy.settingsView.manageTheseInMyProfile}
      </p>
      <p>{copy.settingsView.libraryDocumentsAreSharedWithAuthorizedMembersOfThisDeployment}</p>
      {user.providers.includes('password') && (
        <label>
          {copy.settingsView.confirmCurrentPassword}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            maxLength={128}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
      )}
      {!user.providers.includes('password') && <p>{copy.settingsView.providerOnlyAccountsMustSignInAgainWithinFiveMinutes}</p>}
      <label>
        {copy.settingsView.type}
        {user.username}
        {copy.settingsView.toConfirmExportOrDeletion}
        <input value={confirmation} maxLength={24} autoComplete="off" onChange={(event) => setConfirmation(event.target.value)} />
      </label>
      <div className="account-dialog-actions">
        <button type="button" disabled={busy || confirmation !== user.username} onClick={exportAccount}>
          {copy.settingsView.exportMyAccount}
        </button>
        <button
          type="button"
          className="account-danger"
          disabled={busy || confirmation !== user.username}
          onClick={() =>
            void action(async () => {
              await authRequest('/account', 'DELETE', { currentPassword: password, confirmation })
              onSignedOut()
            })
          }
        >
          {copy.settingsView.deleteMyAccountPermanently}
        </button>
      </div>
      <p>{copy.settingsView.deletionRemovesAccountIdentitiesSessionsSettingsAndPrivateAvatarShared}</p>
    </dialog>
  )
}
