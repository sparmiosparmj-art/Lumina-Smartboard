import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) =>
    Promise.all(registrations.map((registration) => registration.unregister()))
  ).catch(() => {});
  if ('caches' in window) {
    void caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.toLowerCase().includes('workbox')).map((key) => caches.delete(key))
    )).catch(() => {});
  }
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return <main role="alert" className="min-h-screen grid place-items-center bg-slate-950 p-6 text-white">
        <div className="max-w-md text-center"><h1 className="text-xl font-semibold">LuminaBoard hit a problem</h1>
          <p className="mt-2 text-sm text-slate-300">Reload the board to recover from the error. Recent unsaved changes may not be available.</p>
          <button className="mt-5 rounded-lg bg-blue-600 px-4 py-2" onClick={() => window.location.reload()}>Reload board</button>
        </div>
      </main>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(<AppErrorBoundary><App /></AppErrorBoundary>);
