import React from 'react';
import { Link } from 'react-router-dom';

export default function Reports() {
  return (
    <div className="bg-white rounded-2xl border-2 border-slate-300 p-6 text-center space-y-4">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
        <svg className="w-9 h-9 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
      <h2 className="text-2xl font-black text-slate-900">
        Monthly GST Reports
      </h2>
      <p className="text-base text-slate-600 max-w-sm mx-auto">
        Excel exports for buyer statements (HARDCOPY format), GST sales register, and HSN summary will be generated here.
      </p>
      <div className="pt-2">
        <Link
          to="/"
          className="inline-flex items-center justify-center min-h-[48px] px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-base hover:bg-slate-800"
        >
          &larr; Back to Home
        </Link>
      </div>
    </div>
  );
}
