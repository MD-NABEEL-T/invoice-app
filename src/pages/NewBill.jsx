import React from 'react';
import { Link } from 'react-router-dom';

export default function NewBill() {
  return (
    <div className="bg-white rounded-2xl border-2 border-slate-300 p-6 text-center space-y-4">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
        <svg className="w-9 h-9 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <h2 className="text-2xl font-black text-slate-900">
        New Bill Creator
      </h2>
      <p className="text-base text-slate-600 max-w-sm mx-auto">
        Invoice generation with buyer selection, item autocomplete, and automatic intra-state GST calculation is coming in Phase 4.
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
