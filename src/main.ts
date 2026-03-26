import './styles/main.css'
import { App } from './ui/App'

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
