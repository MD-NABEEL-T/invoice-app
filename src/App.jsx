import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppShell from './components/AppShell.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import NewBill from './pages/NewBill.jsx';
import Bills from './pages/Bills.jsx';
import Reports from './pages/Reports.jsx';
import More from './pages/More.jsx';
import Settings from './pages/Settings.jsx';
import Buyers from './pages/Buyers.jsx';
import Items from './pages/Items.jsx';
import ItemImport from './pages/ItemImport.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
            <Route path="reports" element={<Reports />} />
            <Route path="more" element={<More />} />
            <Route path="settings" element={<Settings />} />
            <Route path="buyers" element={<Buyers />} />
            <Route path="items" element={<Items />} />
            <Route path="items/import" element={<ItemImport />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
