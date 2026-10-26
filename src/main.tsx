import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/dm-sans/wght.css'
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import './themes/base.css'
import './themes/motion.css'
import { AppLoader } from './AppLoader'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppLoader />
  </StrictMode>,
)
