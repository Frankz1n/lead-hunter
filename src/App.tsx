import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';
import Login from './pages/Login';
import Search from './pages/Search';

import Crm from './pages/Crm';

// Placeholder Pages for demonstration
const Wallet = () => <div className="p-4"><h1 className="text-2xl font-bold">Carteira</h1><p>Funcionalidade em desenvolvimento.</p></div>;

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Route */}
          <Route path="/login" element={<Login />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/crm" element={<Crm />} />
              <Route path="/search" element={<Search />} />
              <Route path="/wallet" element={<Wallet />} />

              {/* Redirect any unknown protected route to search */}
              <Route path="*" element={<Navigate to="/search" replace />} />
            </Route>
          </Route>

          {/* Catch all redirect to login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
