import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
const password = randomBytes(24).toString('base64url')
const run = Date.now().toString(36)
const accounts: { context: BrowserContext; username: string }[] = []
async function signup(page: Page, origin: string, suffix: string) {
  await page.goto(origin)
  await page.getByRole('button', { name: 'Create an account', exact: true }).click()
  const username = 'wave_' + run + '_' + suffix
  await page.getByLabel('First name', { exact: true }).fill('Wave')
  await page.getByLabel('Last name', { exact: true }).fill('Test')
  await page.getByLabel('Username', { exact: true }).fill(username)
  await page.getByLabel('Email', { exact: true }).fill(username + '@example.test')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.locator('.profile-trigger')).toBeVisible()
  accounts.push({ context: page.context(), username })
  return username
}
async function api(context: BrowserContext, path: string, method = 'GET', data?: unknown) {
  const session = await context.request.get('/api/auth/session')
  const body = await session.json()
  return context.request.fetch('/api' + path, {
    method,
    headers: {
      origin: new URL(session.url()).origin,
      'x-requested-with': 'StudyLibrary',
      'x-csrf-token': body.csrfToken,
      'content-type': 'application/json',
    },
    ...(data === undefined ? {} : { data }),
  })
}
test('live desktop/mobile parity, playback, persistence and account isolation', async ({ browser }) => {
  const current = await browser.newContext({ baseURL: 'http://localhost:4444', viewport: { width: 1440, height: 1000 } })
  const fresh = await browser.newContext({ baseURL: 'http://localhost:4040', viewport: { width: 1440, height: 1000 } })
  const baseline = await current.newPage(),
    page = await fresh.newPage()
  await page.addInitScript(() => {
    const NativeAudio = window.Audio
    const instances: HTMLAudioElement[] = []
    Object.defineProperty(window, '__waveAudio', { value: instances })
    window.Audio = class extends NativeAudio {
      constructor(src?: string) {
        super(src)
        instances.push(this)
      }
    }
  })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    const username = await signup(page, 'http://localhost:4040', 'new')
    await signup(baseline, 'http://localhost:4444', 'old')
    await baseline.evaluate(() => localStorage.setItem('study-library:mode', 'watch'))
    await baseline.reload()
    await expect(page.locator('.watch-shell')).toBeVisible()
    await expect(baseline.locator('.watch-shell')).toBeVisible()
    await expect(page.locator('.watch-mode-switch button')).toHaveCount(2)
    await expect(page.locator('.watch-mode-switch')).not.toContainText(/Study|Markdown/)
    await page.screenshot({ path: 'validation/watch-desktop.png', fullPage: false })
    await baseline.screenshot({ path: 'validation/baseline-watch-desktop.png', fullPage: false })
    const oldWatch = await (await api(current, '/watch/catalog')).json(),
      newWatch = await (await api(fresh, '/watch/catalog')).json()
    const oldMusic = await (await api(current, '/music/library')).json(),
      newMusic = await (await api(fresh, '/music/library')).json()
    expect(newWatch.titles.map((t: { id: string }) => t.id).sort()).toEqual(
      oldWatch.titles.map((t: { id: string }) => t.id).sort(),
    )
    expect(newMusic.tracks.map((t: { id: string }) => t.id).sort()).toEqual(
      oldMusic.tracks.map((t: { id: string }) => t.id).sort(),
    )
    expect(newWatch.media.available).toEqual(oldWatch.media.available)
    for (const path of ['/library', '/markdown', '/practice/capabilities', '/content?path=README.md'])
      expect((await api(fresh, path)).status()).toBe(404)
    const title = newWatch.titles.find((t: { kind: string; files: unknown[] }) => t.kind !== 'album' && t.files.length)
    expect(title, 'An authorized video is required for real playback validation').toBeTruthy()
    expect(newMusic.tracks.length, 'An authorized song is required for real playback validation').toBeGreaterThan(0)
    expect((await api(fresh, '/watch/list/' + title.id, 'PUT', {})).ok()).toBeTruthy()
    expect((await api(fresh, '/watch/progress/' + title.files[0].id, 'PUT', { position: 25, duration: 200 })).ok()).toBeTruthy()
    const saved = await (await api(fresh, '/watch/catalog')).json()
    expect(saved.list).toContain(title.id)
    expect(saved.progress.find((p: { fileId: string }) => p.fileId === title.files[0].id).position).toBe(25)
    const track = newMusic.tracks[0]
    expect((await api(fresh, '/music/likes/' + track.id, 'PUT', {})).ok()).toBeTruthy()
    const playlist = await api(fresh, '/music/playlists', 'POST', { name: 'Wave smoke playlist', trackIds: [track.id] })
    expect(playlist.ok()).toBeTruthy()
    const playlistBody = await playlist.json()
    expect(
      (await api(fresh, '/music/playlists/' + playlistBody.id, 'PATCH', { name: 'Wave renamed playlist' })).ok(),
    ).toBeTruthy()
    const other = await browser.newContext({ baseURL: 'http://localhost:4040' })
    const otherPage = await other.newPage()
    await signup(otherPage, 'http://localhost:4040', 'other')
    const otherState = await (await api(other, '/music/library')).json()
    expect(otherState.state.likes).not.toContain(track.id)
    expect(otherState.state.playlists).toHaveLength(0)
    expect((await api(other, '/music/playlists/' + playlistBody.id, 'DELETE')).status()).toBe(404)
    const otherWatch = await (await api(other, '/watch/catalog')).json()
    expect(otherWatch.list).toHaveLength(0)
    expect(otherWatch.progress).toHaveLength(0)
    // The baseline keeps its separate account namespace, even for the same browser host.
    const originalState = await (await api(current, '/music/library')).json()
    expect(originalState.state.playlists).toHaveLength(0)
    const glass = await page
      .locator('.watch-mode-switch button')
      .first()
      .evaluate((el) => getComputedStyle(el).backdropFilter)
    expect(glass).toContain('blur')
    await page.getByRole('searchbox').fill(title.title)
    await expect(page.locator('.watch-card').first()).toBeVisible()
    await page.locator('.watch-card').first().click()
    await expect(page.locator('.watch-dialog')).toBeVisible()
    await page
      .locator('.watch-dialog')
      .getByRole('button', { name: /play|resume/i })
      .first()
      .click()
    await expect(page.locator('video.watch-player-video')).toBeVisible()
    await expect
      .poll(() => page.locator('video.watch-player-video').evaluate((el: HTMLVideoElement) => el.currentTime), { timeout: 60000 })
      .toBeGreaterThan(0)
    await page.locator('video.watch-player-video').evaluate((el: HTMLVideoElement) => {
      el.currentTime = 40
    })
    await expect
      .poll(() => page.locator('video.watch-player-video').evaluate((el: HTMLVideoElement) => el.currentTime))
      .toBeGreaterThan(39)
    await page.screenshot({ path: 'validation/watch-player-desktop.png' })
    await page.getByRole('button', { name: 'Back to library', exact: true }).click()
    await page.locator('.watch-mode-switch').getByRole('button', { name: 'Music', exact: true }).click()
    await expect(page.locator('.music-shell')).toBeVisible()
    await expect(page.locator('.music-mode-switch button')).toHaveCount(2)
    await baseline.locator('.watch-mode-switch').getByRole('button', { name: 'Music', exact: true }).click()
    await expect(baseline.locator('.music-shell')).toBeVisible()
    await page.screenshot({ path: 'validation/music-desktop.png' })
    await baseline.screenshot({ path: 'validation/baseline-music-desktop.png' })
    // Start a real track through the rendered library and inspect the native media element.
    await page.locator('.music-side-nav').getByRole('button', { name: 'Search', exact: true }).click()
    await page.getByRole('searchbox').fill(track.title)
    await expect(page.locator('.music-row-main').first()).toBeVisible()
    await page.locator('.music-row-main').first().click()
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            (window as Window & { __waveAudio: HTMLAudioElement[] }).__waveAudio.some((el) => el.currentTime > 0 && !el.paused),
          ),
        { timeout: 60000 },
      )
      .toBeTruthy()
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 })
      await expect(page.locator('.music-row-main').first()).toBeVisible()
      await page.screenshot({ path: 'validation/music-' + width + '.png' })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
      await page.locator('.music-mode-switch').getByRole('button', { name: 'Watch', exact: true }).click()
      await expect(page.locator('.watch-shell')).toBeVisible()
      await expect(page.locator('.watch-card').first()).toBeVisible()
      await page.screenshot({ path: 'validation/watch-' + width + '.png' })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
      await page.locator('.watch-mode-switch').getByRole('button', { name: 'Music', exact: true }).click()
      await expect(page.locator('.music-shell')).toBeVisible()
    }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBeTruthy()
    await page.locator('.profile-trigger').click()
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
    await expect(page.getByLabel('Email or username')).toBeVisible()
    await page.getByLabel('Email or username').fill(username)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.locator('.music-shell')).toBeVisible()
    const persisted = await (await api(fresh, '/music/library')).json()
    expect(persisted.state.likes).toContain(track.id)
    expect(persisted.state.playlists.some((p: { name: string }) => p.name === 'Wave renamed playlist')).toBeTruthy()
    expect(errors).toEqual([])
    writeFileSync(
      'validation/parity-summary.json',
      JSON.stringify(
        {
          watchTitles: newWatch.titles.length,
          musicTracks: newMusic.tracks.length,
          mediaTools: newWatch.media.available,
          desktop: [1440, 1000],
          mobileWidths: [320, 390, 768],
          browserErrors: errors,
          realVideoPlayback: true,
          realAudioPlayback: true,
        },
        null,
        2,
      ),
    )
  } finally {
    for (const account of accounts.splice(0).reverse()) {
      try {
        const response = await api(account.context, '/account', 'DELETE', {
          currentPassword: password,
          confirmation: account.username,
        })
        expect(response.ok(), 'Temporary account cleanup').toBeTruthy()
      } catch {
        console.error('Temporary account cleanup failed for a test account; inspect the database cleanup check.')
      }
    }
    await current.close()
    await fresh.close()
  }
})

test('touch phone layout, account controls and landscape switching', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: 'http://localhost:4040',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  try {
    await page.goto('http://localhost:4040')
    await expect(page.getByLabel('Email or username')).toBeVisible()
    await page.screenshot({ path: 'validation/login-phone.png', fullPage: true })
    await signup(page, 'http://localhost:4040', 'touch')
    await expect(page.locator('.watch-card').first()).toBeVisible()
    await page.locator('.watch-mode-switch').getByRole('button', { name: 'Music', exact: true }).tap()
    await expect(page.locator('.music-shell')).toBeVisible()
    await page.locator('.profile-trigger').tap()
    await expect(page.getByRole('menuitem', { name: 'My profile', exact: true })).toBeVisible()
    await page.getByRole('menuitem', { name: 'My profile', exact: true }).tap()
    await expect(page.locator('dialog.account-dialog')).toBeVisible()
    await page.locator('dialog.account-dialog').getByRole('button', { name: 'Close profile', exact: true }).tap()
    await page.screenshot({ path: 'validation/music-touch-phone.png' })
    await page.setViewportSize({ width: 844, height: 390 })
    await page.screenshot({ path: 'validation/music-touch-landscape.png' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.locator('.music-mode-switch').getByRole('button', { name: 'Watch', exact: true }).tap()
    await expect(page.locator('.watch-card').first()).toBeVisible()
    await page.screenshot({ path: 'validation/watch-touch-landscape.png' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  } finally {
    for (const account of accounts.splice(0).reverse()) {
      const response = await api(account.context, '/account', 'DELETE', {
        currentPassword: password,
        confirmation: account.username,
      })
      expect(response.ok()).toBeTruthy()
    }
    await context.close()
  }
})
