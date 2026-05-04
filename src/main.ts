import './styles/main.css'
import { App } from './ui/App'
import { SplashController } from './ui/SplashController'

new SplashController()
new App()

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
