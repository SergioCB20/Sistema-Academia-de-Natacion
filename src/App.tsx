import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Schedule from './pages/Schedule';
import Finance from './pages/Finance';
import IDCard from './pages/IDCard';
import Login from './pages/Login';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="alumnos" element={<Students />} />
          <Route path="horarios" element={<Schedule />} />
          <Route path="caja" element={<Finance />} />
          <Route path="carnet" element={<IDCard />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;