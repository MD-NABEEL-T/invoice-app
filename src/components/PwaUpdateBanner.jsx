import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Bottom banner prompting the user to update when a new version is deployed.
 * Refreshes the service worker and reloads the app with the latest assets.
 */
export default function PwaUpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        // Check for updates every 60 minutes
        setInterval(() => {
          r.update();
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.warn('SW registration error:', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto p-4 rounded-2xl bg-slate-900 text-white shadow-2xl border-2 border-blue-500 flex items-center justify-between gap-3 no-print"
    >
      <div className="flex items-center space-x-2">
        <span className="text-xl">✨</span>
        <span className="text-sm font-bold">New version available</span>
      </div>
      <div className="flex items-center space-x-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await updateServiceWorker(true);
            } catch (err) {
              console.warn('SW update error:', err);
            }
            window.location.reload();
          }}
          className="min-h-[40px] px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm transition cursor-pointer"
        >
          Update
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="w-8 h-8 rounded-lg text-slate-400 hover:text-white flex items-center justify-center font-bold cursor-pointer"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
