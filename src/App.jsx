import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import AppShell from './components/AppShell.jsx';
import Home from './pages/Home.jsx';
import NewBill from './pages/NewBill.jsx';
import Bills from './pages/Bills.jsx';
import BillView from './pages/BillView.jsx';
import Reports from './pages/Reports.jsx';
import More from './pages/More.jsx';
import Settings from './pages/Settings.jsx';
import Buyers from './pages/Buyers.jsx';
import Items from './pages/Items.jsx';
import ItemImport from './pages/ItemImport.jsx';
import PwaUpdateBanner from './components/PwaUpdateBanner.jsx';

// Dev-only route for fixture and print layout testing (excluded in production build)
const DevPrintSample = import.meta.env.DEV
  ? React.lazy(() => import('./pages/DevPrintSample.jsx'))
  : null;

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PwaUpdateBanner />
        <Routes>
          {/* Main App Routes inside AppShell - completely open without login */}
          <Route path="/" element={<AppShell />}>
            <Route index element={<Home />} />
            <Route path="new" element={<NewBill />} />
            <Route path="bills" element={<Bills />} />
            <Route path="bills/:id" element={<BillView />} />
            <Route path="bills/:id/edit" element={<NewBill />} />
            <Route path="reports" element={<Reports />} />
            <Route path="more" element={<More />} />
            <Route path="settings" element={<Settings />} />
            <Route path="buyers" element={<Buyers />} />
            <Route path="items" element={<Items />} />
            <Route path="items/import" element={<ItemImport />} />
          </Route>

          {/* Dev-only route for A4 invoice print/PDF test fixtures */}
          {import.meta.env.DEV && DevPrintSample && (
            <Route
              path="/dev/print-sample"
              element={
                <React.Suspense fallback={<div className="p-8 text-center font-bold">Loading print fixtures...</div>}>
                  <DevPrintSample />
                </React.Suspense>
              }
            />
          )}

          {/* Legacy /login redirect to Home */}
          <Route path="/login" element={<Navigate to="/" replace />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
