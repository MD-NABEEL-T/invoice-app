import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function More() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [selectedItem, setSelectedItem] = useState(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const menuSections = [
    {
      id: 'buyers',
      title: 'Buyers & Branches',
      desc: 'KH Export India branch addresses and units',
      icon: (
        <svg className="w-6 h-6 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      id: 'items',
      title: 'Items & HSN Catalog',
      desc: 'Products, units, HSN codes and GST rates',
      icon: (
        <svg className="w-6 h-6 text-indigo-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      id: 'settings',
      title: 'App Settings',
      desc: 'FY starting bill number and firm profile',
      icon: (
        <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      id: 'backup',
      title: 'Backup & Export',
      desc: 'Download all bills and catalogs as backup',
      icon: (
        <svg className="w-6 h-6 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      ),
    },
  ];

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Account Info Box */}
      <div className="bg-white rounded-2xl border-2 border-slate-300 p-5 shadow-sm">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Signed In Account
        </p>
        <p className="text-lg font-black text-slate-900 mt-1 break-all">
          {user?.email || 'Authenticated User'}
        </p>
        <p className="text-xs font-semibold text-emerald-700 mt-1 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
          Session remains active on this device
        </p>
      </div>

      {/* Menu List */}
      <div className="space-y-3">
        <h3 className="text-lg font-black text-slate-900 px-1">
          Management & Settings
        </h3>

        <div className="bg-white rounded-2xl border-2 border-slate-300 divide-y-2 divide-slate-200 overflow-hidden shadow-sm">
          {menuSections.map((item) => {
            const isClickableRoute = ['buyers', 'items', 'settings'].includes(item.id);
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'buyers') navigate('/buyers');
                  else if (item.id === 'items') navigate('/items');
                  else if (item.id === 'settings') navigate('/settings');
                  else setSelectedItem(selectedItem === item.id ? null : item.id);
                }}
                className="w-full min-h-[58px] p-4 text-left flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="p-2 rounded-xl bg-slate-100 shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-base font-bold text-slate-900">
                      {item.title}
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                      {item.desc}
                    </p>
                  </div>
                </div>
                {isClickableRoute ? (
                  <span className="text-slate-400 font-black text-xl px-1">
                    ›
                  </span>
                ) : (
                  <span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-lg shrink-0">
                    Coming Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Modal / Alert for Placeholder Click */}
      {selectedItem && (
        <div className="bg-blue-50 border-2 border-blue-400 rounded-2xl p-4 text-blue-950 flex items-start justify-between">
          <div>
            <p className="text-base font-bold capitalize">
              {selectedItem} Module
            </p>
            <p className="text-sm font-medium text-blue-800 mt-0.5">
              This module is scheduled for upcoming implementation phases.
            </p>
          </div>
          <button
            onClick={() => setSelectedItem(null)}
            className="text-sm font-extrabold text-blue-700 underline px-2 py-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Sign Out Section */}
      <div className="pt-2">
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="w-full min-h-[52px] px-6 py-3.5 rounded-2xl border-2 border-red-500 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-900 font-bold text-lg flex items-center justify-center space-x-2.5 transition"
        >
          {isSigningOut ? (
            <span className="flex items-center space-x-2">
              <span className="w-5 h-5 border-2 border-red-800/40 border-t-red-800 rounded-full animate-spin"></span>
              <span>Signing Out...</span>
            </span>
          ) : (
            <>
              <svg className="w-6 h-6 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Sign Out</span>
            </>
          )}
        </button>
        <p className="text-xs text-center text-slate-500 mt-2 font-medium">
          Only sign out if you want to switch accounts.
        </p>
      </div>
    </div>
  );
}
