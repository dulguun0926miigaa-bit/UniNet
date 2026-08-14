import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AppErrorBoundary from './errors/AppErrorBoundary.jsx'
import { authService } from './auth/authService.js'
import { initializeUiPreferences } from './settings/uiPreferences.js'

initializeUiPreferences()

const returnToLanding = () => {
  authService.clearSession()
  window.history.replaceState({}, '', '/')
  window.location.reload()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary onGoHome={returnToLanding}>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
