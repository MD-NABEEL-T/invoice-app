import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppShell from './components/AppShell.jsx';
import Login from './pages/Login.jsx';
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
          {/* Public Login Route */}
          <Route path="/login" element={<Login />} />

          {/* Protected App Routes inside AppShell */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
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

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
