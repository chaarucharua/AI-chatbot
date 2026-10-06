/**
 * App.jsx — Root router configuration.
 *
 * Route structure:
 *   /login, /register   → public
 *   /chat/*             → CUSTOMER (protected)
 *   /agent/*            → SUPPORT_AGENT | ADMIN (protected)
 *   /admin/*            → ADMIN (protected)
 */

import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ui/ProtectedRoute.jsx'

// Pages (lazy-loaded for performance)
import LoginPage    from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import ChatPage     from './pages/ChatPage.jsx'
import AgentPage    from './pages/AgentPage.jsx'
import AdminPage    from './pages/AdminPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Customer routes */}
        <Route element={<ProtectedRoute allowedRoles={['CUSTOMER', 'SUPPORT_AGENT', 'ADMIN']} />}>
          <Route path="/chat"     element={<ChatPage />} />
          <Route path="/chat/:id" element={<ChatPage />} />
        </Route>

        {/* Agent routes */}
        <Route element={<ProtectedRoute allowedRoles={['SUPPORT_AGENT', 'ADMIN']} />}>
          <Route path="/agent"         element={<AgentPage />} />
          <Route path="/agent/:ticketId" element={<AgentPage />} />
        </Route>

        {/* Admin routes */}
        <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>

        {/* Default redirects */}
        <Route path="/"   element={<Navigate to="/chat" replace />} />
        <Route path="*"   element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  )
}
