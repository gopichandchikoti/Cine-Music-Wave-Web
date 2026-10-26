import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../../server/app.js'
import { loadServerConfig, type ServerConfig } from '../../server/config/index.js'

export const ORIGIN = 'http://localhost:4040'
export const STRONG_PASSWORD = 'correct horse battery staple 42'

type Response = { status: number; headers: Headers; text: string; json: Record<string, unknown> | null }

/** A browser-like client: it keeps cookies and the CSRF token the way the real app does. */
export class Client {
  private readonly cookies = new Map<string, string>()
  csrf = ''
  constructor(
    private readonly base: string,
    private readonly address: string,
  ) {}

  async request(
    route: string,
    options: { method?: string; body?: unknown; headers?: Record<string, string>; csrf?: boolean } = {},
  ): Promise<Response> {
    const { method = 'GET', body, headers = {}, csrf = true } = options
    const cookie = [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ')
    const response = await fetch(`${this.base}${route}`, {
      method,
      redirect: 'manual',
      headers: {
        origin: ORIGIN,
        // Each client has its own address, so one test's sign-ups never use up another's rate limit.
        'x-forwarded-for': this.address,
        ...(cookie ? { cookie } : {}),
        ...(csrf && this.csrf ? { 'x-csrf-token': this.csrf } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(';')
      const [key, ...rest] = pair.split('=')
      const value = rest.join('=')
      if (value) this.cookies.set(key, value)
      else this.cookies.delete(key)
    }
    const text = await response.text()
    let json: Record<string, unknown> | null = null
    try {
      json = JSON.parse(text) as Record<string, unknown>
    } catch {
      json = null
    }
    if (typeof json?.csrfToken === 'string') this.csrf = json.csrfToken
    return { status: response.status, headers: response.headers, text, json }
  }

  forgeCookie(name: string, value: string): void {
    this.cookies.set(name, value)
  }

  cookieNames(): string[] {
    return [...this.cookies.keys()]
  }
}

export type AccountServer = {
  url: string
  config: ServerConfig
  signUp: (label: string) => Promise<{ client: Client; username: string; password: string }>
  anonymous: () => Promise<Client>
  stop: () => Promise<void>
}

const driveOf = (directory: string): string => /^([A-Za-z]):/.exec(directory)?.[1]?.toUpperCase() ?? 'G'

/** The full application on a random port with a throw-away database and an empty media folder. */
export async function startAccountServer(overrides: Record<string, string> = {}): Promise<AccountServer> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cine-music-wave-security-'))
  const media = path.join(root, 'media')
  await mkdir(media, { recursive: true })
  await writeFile(path.join(root, 'outside-secret.txt'), 'TOP-SECRET-OUTSIDE-ROOT')
  const config = loadServerConfig({
    NODE_ENV: 'test',
    AUTH_MODE: 'accounts',
    AUTH_PUBLIC_ORIGIN: ORIGIN,
    AUTH_SIGNUP_ENABLED: 'true',
    AUTH_TRUST_PROXY: 'loopback',
    PERSONAL_DB_PATH: path.join(root, 'personal.sqlite'),
    WATCH_MEDIA_DIR: media,
    WATCH_ALLOWED_DRIVE: driveOf(media),
    WATCH_CATALOG_DIR: path.join(root, 'catalog'),
    WATCH_PREVIEWS: 'lazy',
    ...overrides,
  })
  const { app, close } = await createApp(config)
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
  })
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  let counter = 0
  let addresses = 0
  const anonymous = async (): Promise<Client> => {
    addresses += 1
    const client = new Client(url, `10.${Math.floor(addresses / 250)}.${addresses % 250}.7`)
    await client.request('/api/auth/session')
    return client
  }
  const signUp = async (label: string) => {
    counter += 1
    const username = `${label}${counter}${Date.now().toString(36)}`.slice(0, 24)
    const client = await anonymous()
    const created = await client.request('/api/auth/signup', {
      method: 'POST',
      body: {
        email: `${username}@example.test`,
        username,
        firstName: 'Test',
        lastName: 'Account',
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      },
    })
    if (created.status !== 201) throw new Error(`sign-up failed with ${created.status}: ${created.text}`)
    return { client, username, password: STRONG_PASSWORD }
  }
  const stop = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
    close()
    await rm(root, { recursive: true, force: true })
  }
  return { url, config, signUp, anonymous, stop }
}
