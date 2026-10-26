import App from './App.tsx'
import { MusicProvider } from './features/music/MusicProvider'

/** The app and the music player it hosts, loaded together so the player's code stays out of the first download. */
export default function AppRoot() {
  return (
    <MusicProvider>
      <App />
    </MusicProvider>
  )
}
