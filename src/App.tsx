import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SeasonProvider } from './contexts/SeasonContext';
import ProtectedRoute from './components/ProtectedRoute';
import { SeasonGuard } from './components/SeasonGuard';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Schedule from './pages/Schedule';
import Finance from './pages/Finance';
import IDCard from './pages/IDCard';
import Login from './pages/Login';
import Register from './pages/Register';
import SeasonSetup from './pages/setup/SeasonSetup';
import Categories from './pages/admin/Categories';
import Seasons from './pages/admin/Seasons';
import Packages from './pages/admin/Packages';
import ScheduleTemplates from './pages/admin/ScheduleTemplates';
import PaymentMethods from './pages/admin/PaymentMethods';

function App() {
  return (
    <AuthProvider>
      <SeasonProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/setup/season" element={<SeasonSetup />} />

            <Route path="/" element={
              <ProtectedRoute>
                <SeasonGuard>
                  <MainLayout />
                </SeasonGuard>
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

              {/* Admin Routes */}
              <Route path="admin/categorias" element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <Categories />
                </ProtectedRoute>
              } />
              <Route path="admin/temporadas" element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <Seasons />
                </ProtectedRoute>
              } />
              <Route path="admin/paquetes" element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <Packages />
                </ProtectedRoute>
              } />
              <Route path="admin/plantillas" element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <ScheduleTemplates />
                </ProtectedRoute>
              } />
              <Route path="admin/pagos" element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <PaymentMethods />
                </ProtectedRoute>
              } />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </SeasonProvider>
    </AuthProvider>
  );
}

export default App;
