import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import AcceptInvite from './pages/AcceptInvite';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Projects from './pages/Projects';
import Upload from './pages/Upload';
import Status from './pages/Status';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <Projects />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id/upload"
        element={
          <ProtectedRoute>
            <Upload />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id/status"
        element={
          <ProtectedRoute>
            <Status />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
