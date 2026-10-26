import { Suspense, lazy } from 'react'

const AppRoot = lazy(() => import('./AppRoot.tsx'))

export function AppLoader() {
  return (
    <Suspense
      fallback={
        <main className="account-shell">
          <p role="status">{__LIBRARY_LOADING_TEXT__}</p>
        </main>
      }
    >
      <AppRoot />
    </Suspense>
  )
}
