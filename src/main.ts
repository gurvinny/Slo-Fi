import './styles/main.css'
import { App } from './ui/App'

// A dynamically-imported chunk (e.g. the 3D orb) can fail to load when a
// client is running an index.html from a previous deploy that references chunk
// hashes the current deploy no longer serves. Vite fires `vite:preloadError`
// in that case; reload once to fetch the current index.html and chunks. The
// sessionStorage guard prevents a reload loop when the server is genuinely
// unreachable.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  if (!sessionStorage.getItem('reloadedAfterPreloadError')) {
    sessionStorage.setItem('reloadedAfterPreloadError', '1')
    window.location.reload()
  }
})

// Clear the guard shortly after a healthy load so a future genuine stale-chunk
// failure can still trigger one self-healing reload.
window.addEventListener('load', () => {
  setTimeout(() => sessionStorage.removeItem('reloadedAfterPreloadError'), 5000)
})

new App()

const loader = document.getElementById('page-loader')
if (loader) {
  loader.classList.add('fade-out')
  loader.addEventListener('transitionend', () => loader.remove(), { once: true })
}

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // SW registration is optional — fail silently
  })
}
