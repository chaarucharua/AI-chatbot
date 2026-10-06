/**
 * App.jsx — Root router configuration.
 *
 * Role routing:
 *   CUSTOMER         → /chat
 *   SUPPORT_AGENT    → /agent
 *   ADMIN            → /admin
 *
 * Access control:
 *   /chat/*   → CUSTOMER only
 *   /agent/*  → SUPPORT_AGENT | ADMIN
 *   /admin/*  → ADMIN only
 */

import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ui/ProtectedRoute.jsx'

// Pages
import LoginPage    from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import ChatPage     from './pages/ChatPage.jsx'
import AgentPage    from './pages/AgentPage.jsx'
import AdminPage    from './pages/AdminPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

/** Sends each role to their correct home page after login or root visit. */
function RoleHomeRedirect() {
  const { user, isAuthenticated, loading } = useAuth()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.role === 'ADMIN')          return <Navigate to="/admin" replace />
  if (user?.role === 'SUPPORT_AGENT')  return <Navigate to="/agent" replace />
  return <Navigate to="/chat" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Customer-only: SUPPORT_AGENT and ADMIN are redirected away */}
        <Route element={<ProtectedRoute allowedRoles={['CUSTOMER']} />}>
          <Route path="/chat"     element={<ChatPage />} />
          <Route path="/chat/:id" element={<ChatPage />} />
        </Route>

        {/* Agent workspace */}
        <Route element={<ProtectedRoute allowedRoles={['SUPPORT_AGENT', 'ADMIN']} />}>
          <Route path="/agent"           element={<AgentPage />} />
          <Route path="/agent/:ticketId" element={<AgentPage />} />
        </Route>

        {/* Admin console */}
        <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>

        {/* Root → role-based home */}
        <Route path="/" element={<RoleHomeRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  )
}
