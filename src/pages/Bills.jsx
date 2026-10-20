import React from 'react';
import { Link } from 'react-router-dom';

export default function Bills() {
  return (
    <div className="bg-white rounded-2xl border-2 border-slate-300 p-6 text-center space-y-4">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
        <svg className="w-9 h-9 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h2 className="text-2xl font-black text-slate-900">
        Bills Register
      </h2>
      <p className="text-base text-slate-600 max-w-sm mx-auto">
        Full invoice list, search by number or buyer, reprint PDF, and copy-as-new bill features will be available here.
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
