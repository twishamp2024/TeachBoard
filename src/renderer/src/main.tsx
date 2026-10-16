import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource/atkinson-hyperlegible/400-italic.css'
import '@fontsource/atkinson-hyperlegible/700-italic.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/400-italic.css'
import '@fontsource/merriweather/400.css'
import '@fontsource/merriweather/700.css'
import '@fontsource/merriweather/400-italic.css'
import '@fontsource/patrick-hand/400.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import './styles/tokens.css'
import './styles/app.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import { APP_NAME } from './platform'

document.title = APP_NAME
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
