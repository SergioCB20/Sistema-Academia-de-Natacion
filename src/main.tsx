import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

// Global error handler for dynamic import failures (version mismatch)
const handleDynamicImportError = (error: any) => {
  const message = error?.message || error?.reason?.message || '';
  if (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed')
  ) {
    console.log('Reloading due to dynamic import error...');
    window.location.reload();
  }
};

window.addEventListener('error', handleDynamicImportError);
window.addEventListener('unhandledrejection', handleDynamicImportError);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
