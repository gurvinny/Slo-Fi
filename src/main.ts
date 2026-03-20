import './styles/main.css'
import { App } from './ui/App'

new App()

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // SW registration is optional — fail silently
  })
}
