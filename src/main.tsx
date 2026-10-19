import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Overlay } from './views/Overlay'

// The always-on pack opens a second window on index.html?overlay=1.
const isOverlay = new URLSearchParams(window.location.search).has('overlay')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isOverlay ? <Overlay /> : <App />}
  </StrictMode>,
)
