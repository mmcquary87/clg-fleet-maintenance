import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registers the no-op passthrough service worker (public/sw.js) so the
// app is installable ("Add to Home Screen" / desktop install) on
// browsers that require one — see that file for why it deliberately
// caches nothing.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability is a nice-to-have, not a hard requirement — a
      // failed registration shouldn't be treated as an app error.
    })
  })
}
