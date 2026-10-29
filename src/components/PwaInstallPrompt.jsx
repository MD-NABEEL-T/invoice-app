import React, { useEffect, useState } from 'react';

/**
 * PWA Install Prompt component.
 * Captures `beforeinstallprompt` event on supported browsers (Chrome, Android, Edge)
 * and provides a 1-tap Install button for the Uncle and Son.
 */
export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('khansa_pwa_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // Check if running in standalone PWA mode
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    ) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('khansa_pwa_dismissed', 'true');
    } catch (e) {
      console.warn('Session storage error:', e);
    }
  };

  // Don't show if already installed, dismissed for this session, or not eligible
  if (isInstalled || dismissed || !deferredPrompt) {
    return null;
  }

  return (
    <div
      role="banner"
      className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-3.5 rounded-2xl border-2 border-blue-400 shadow-xl mb-4 flex items-center justify-between gap-3 no-print"
    >
      <div className="flex items-center space-x-3">
        <img
          src="/KhansaEnterprises.jpg"
          alt="Khansa Enterprises Logo"
          className="w-11 h-11 rounded-xl object-contain bg-white border border-blue-400 p-0.5 shadow-md shrink-0"
        />
        <div>
          <p className="text-sm font-black tracking-wide leading-tight">
            Install Khansa Invoices App
          </p>
          <p className="text-xs text-blue-200 font-medium">
            Add to home screen for instant 1-tap access &amp; offline use
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2 shrink-0">
        <button
          type="button"
          onClick={handleInstallClick}
          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-black text-xs transition shadow-md active:scale-95 cursor-pointer"
        >
          Install App
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="w-8 h-8 rounded-lg text-slate-300 hover:text-white flex items-center justify-center font-bold cursor-pointer"
          aria-label="Dismiss banner"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
