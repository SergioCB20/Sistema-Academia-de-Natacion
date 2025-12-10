import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Schedule from './pages/Schedule';
import Finance from './pages/Finance';
import IDCard from './pages/IDCard';
import Login from './pages/Login';
import Register from './pages/Register';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route path="/" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="alumnos" element={<Students />} />
            <Route path="horarios" element={<Schedule />} />
            <Route path="caja" element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <Finance />
              </ProtectedRoute>
            } />
            <Route path="carnet" element={<IDCard />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;