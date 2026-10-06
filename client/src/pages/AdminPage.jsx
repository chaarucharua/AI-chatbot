/**
 * AdminPage.jsx — Responsive system metrics, knowledge base ingestion, user RBAC, and RAG logs.
 */

import React, { useState, useEffect } from 'react';
import Navbar from '../components/ui/Navbar.jsx';
import api from '../services/api.js';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [users, setUsers] = useState([]);
  const [ragLogs, setRagLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  // Upload modal state
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadType, setUploadType] = useState('GENERAL');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  // Fetch overview stats
  const fetchStats = async () => {
    try {
      const res = await api.get('/admin/stats');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  // Fetch documents
  const fetchDocuments = async () => {
    try {
      const res = await api.get('/knowledge/documents');
      setDocuments(res.data || []);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  // Fetch users
  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  // Fetch RAG logs
  const fetchRagLogs = async () => {
    try {
      const res = await api.get('/admin/rag-logs');
      setRagLogs(res.data || []);
    } catch (err) {
      console.error('Failed to fetch RAG logs:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchDocuments();
    fetchUsers();
    fetchRagLogs();
  }, []);

  // Upload file
  const handleUploadDocument = async (e) => {
    e.preventDefault();
    if (!uploadFile) return;

    setUploading(true);
    setUploadMessage('');

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('title', uploadTitle || uploadFile.name);
    formData.append('document_type', uploadType);

    try {
      await api.post('/knowledge/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadMessage('Document uploaded and indexed successfully!');
      setUploadFile(null);
      setUploadTitle('');
      fetchDocuments();
      fetchStats();
    } catch (err) {
      setUploadMessage(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Reindex document
  const handleReindex = async (docId) => {
    try {
      await api.post(`/knowledge/documents/${docId}/reindex`);
      fetchDocuments();
      fetchStats();
    } catch (err) {
      console.error('Failed to reindex document:', err);
    }
  };

  // Delete document
  const handleDeleteDoc = async (docId) => {
    if (!window.confirm('Delete this document and all its indexed vector chunks?')) return;
    try {
      await api.delete(`/knowledge/documents/${docId}`);
      fetchDocuments();
      fetchStats();
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  // Update user role
  const handleUpdateUserRole = async (userId, role) => {
    try {
      await api.patch(`/admin/users/${userId}`, { role });
      fetchUsers();
      fetchStats();
    } catch (err) {
      console.error('Failed to update user role:', err);
    }
  };

  return (
    <div className="h-full w-full bg-surface-900 flex flex-col overflow-hidden">
      <Navbar />

      <main className="flex-1 overflow-y-auto p-3 sm:p-6 max-w-7xl w-full mx-auto space-y-4 sm:space-y-6">
        {/* Admin Header with Responsive Tabs */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-surface-700 pb-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-100">
              Admin & Operations Console
            </h1>
            <p className="text-xs text-slate-400">
              System metrics, knowledge base ingestion, and user access
            </p>
          </div>

          <div className="w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <div className="flex items-center gap-1.5 bg-surface-800 p-1 rounded-xl border border-surface-700 whitespace-nowrap min-w-max">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'knowledge', label: 'Knowledge Base' },
                { id: 'users', label: 'Users & Roles' },
                { id: 'observability', label: 'RAG Logs' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab 1: Overview */}
        {activeTab === 'overview' && stats && (
          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="card p-4 sm:p-5 border-surface-700">
                <span className="text-xs text-slate-400 font-medium">Total Users</span>
                <div className="text-2xl font-bold text-slate-100 mt-1">{stats.users.total_users}</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {stats.users.customers} customers · {stats.users.agents} agents · {stats.users.admins} admins
                </div>
              </div>

              <div className="card p-4 sm:p-5 border-surface-700">
                <span className="text-xs text-slate-400 font-medium">Conversations</span>
                <div className="text-2xl font-bold text-slate-100 mt-1">{stats.conversations.total_conversations}</div>
                <div className="text-[11px] text-amber-400 mt-1">
                  {stats.conversations.escalated_conversations} escalated to tickets
                </div>
              </div>

              <div className="card p-4 sm:p-5 border-surface-700">
                <span className="text-xs text-slate-400 font-medium">Support Tickets</span>
                <div className="text-2xl font-bold text-slate-100 mt-1">{stats.tickets.total_tickets}</div>
                <div className="text-[11px] text-emerald-400 mt-1">
                  {stats.tickets.open_tickets} open · {stats.tickets.in_progress_tickets} in progress
                </div>
              </div>

              <div className="card p-4 sm:p-5 border-surface-700">
                <span className="text-xs text-slate-400 font-medium">Indexed Knowledge Chunks</span>
                <div className="text-2xl font-bold text-slate-100 mt-1">{stats.knowledgeBase.total_chunks || 0}</div>
                <div className="text-[11px] text-brand-400 mt-1">
                  {stats.knowledgeBase.total_documents} active documents
                </div>
              </div>
            </div>

            {/* RAG Metrics Card */}
            <div className="card p-4 sm:p-6 border-surface-700 bg-surface-850/50">
              <h2 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider mb-4">
                RAG Pipeline Performance & Observability
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-center">
                <div className="p-3 sm:p-4 rounded-xl bg-surface-900 border border-surface-700">
                  <span className="text-[11px] sm:text-xs text-slate-400">Total Queries</span>
                  <div className="text-lg sm:text-xl font-bold text-slate-100 mt-1">
                    {stats.ragMetrics.total_queries}
                  </div>
                </div>

                <div className="p-3 sm:p-4 rounded-xl bg-surface-900 border border-surface-700">
                  <span className="text-[11px] sm:text-xs text-slate-400">Grounded Rate</span>
                  <div className="text-lg sm:text-xl font-bold text-emerald-400 mt-1">
                    {stats.ragMetrics.total_queries > 0
                      ? `${Math.round(
                          (stats.ragMetrics.supported_queries / stats.ragMetrics.total_queries) * 100
                        )}%`
                      : '100%'}
                  </div>
                </div>

                <div className="p-3 sm:p-4 rounded-xl bg-surface-900 border border-surface-700">
                  <span className="text-[11px] sm:text-xs text-slate-400">Escalations</span>
                  <div className="text-lg sm:text-xl font-bold text-amber-400 mt-1">
                    {stats.ragMetrics.escalations_offered}
                  </div>
                </div>

                <div className="p-3 sm:p-4 rounded-xl bg-surface-900 border border-surface-700">
                  <span className="text-[11px] sm:text-xs text-slate-400">Avg Latency</span>
                  <div className="text-lg sm:text-xl font-bold text-brand-400 mt-1">
                    {stats.ragMetrics.avg_latency_ms} ms
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Knowledge Base Management */}
        {activeTab === 'knowledge' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Upload Box */}
            <div className="card p-4 sm:p-6 border-surface-700 bg-surface-850/50">
              <h2 className="text-sm font-bold text-slate-200 mb-2">
                Upload & Ingest Support Document
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Supported formats: Markdown (.md), Plain text (.txt), PDF (.pdf), Structured FAQ (.json).
              </p>

              {uploadMessage && (
                <div className="mb-4 p-3 rounded-lg text-xs bg-brand-500/10 border border-brand-500/20 text-brand-300">
                  {uploadMessage}
                </div>
              )}

              <form onSubmit={handleUploadDocument} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-end">
                <div>
                  <label className="label text-xs">Document Title</label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="e.g. Return Policy 2026"
                    className="input text-xs"
                  />
                </div>

                <div>
                  <label className="label text-xs">Document Type</label>
                  <select
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value)}
                    className="input text-xs"
                  >
                    <option value="POLICY">Policy</option>
                    <option value="FAQ">FAQ</option>
                    <option value="PRODUCT">Product</option>
                    <option value="GENERAL">General</option>
                  </select>
                </div>

                <div>
                  <label className="label text-xs">Choose File</label>
                  <input
                    type="file"
                    accept=".txt,.md,.pdf,.json"
                    onChange={(e) => setUploadFile(e.target.files[0])}
                    className="input text-xs py-1.5"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!uploadFile || uploading}
                  className="btn-primary py-2.5 text-xs font-semibold"
                >
                  {uploading ? 'Ingesting...' : 'Upload & Ingest'}
                </button>
              </form>
            </div>

            {/* Document Table (Responsive Scroll Container) */}
            <div className="card overflow-hidden border-surface-700">
              <div className="p-3 sm:p-4 border-b border-surface-700 bg-surface-850/40">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Ingested Knowledge Documents ({documents.length})
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 min-w-[620px]">
                  <thead className="bg-surface-850/70 text-slate-400 font-semibold border-b border-surface-700">
                    <tr>
                      <th className="p-3">Title</th>
                      <th className="p-3">Filename</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Chunks</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-700/60">
                    {documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-surface-800/40">
                        <td className="p-3 font-semibold text-slate-100">{doc.title}</td>
                        <td className="p-3 text-slate-400 font-mono text-[11px]">{doc.filename}</td>
                        <td className="p-3">
                          <span className="badge bg-surface-800 border border-surface-700 text-slate-300 text-[10px]">
                            {doc.document_type}
                          </span>
                        </td>
                        <td className="p-3 font-mono">{doc.chunk_count}</td>
                        <td className="p-3">
                          <span
                            className={`badge text-[10px] ${
                              doc.status === 'ACTIVE'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : doc.status === 'PROCESSING'
                                ? 'bg-amber-500/15 text-amber-400'
                                : 'bg-red-500/15 text-red-400'
                            }`}
                          >
                            {doc.status}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-1.5">
                          <button
                            onClick={() => handleReindex(doc.id)}
                            className="btn-secondary text-[11px] py-1 px-2.5"
                          >
                            Re-index
                          </button>
                          <button
                            onClick={() => handleDeleteDoc(doc.id)}
                            className="btn-danger text-[11px] py-1 px-2.5"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Users & Roles */}
        {activeTab === 'users' && (
          <div className="card overflow-hidden border-surface-700">
            <div className="p-3 sm:p-4 border-b border-surface-700 bg-surface-850/40">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                User Access & Role Management
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 min-w-[580px]">
                <thead className="bg-surface-850/70 text-slate-400 font-semibold border-b border-surface-700">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Current Role</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Change Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-700/60">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-surface-800/40">
                      <td className="p-3 font-semibold text-slate-100">{u.name}</td>
                      <td className="p-3 text-slate-400">{u.email}</td>
                      <td className="p-3">
                        <span className="badge bg-brand-500/15 text-brand-300 text-[10px]">{u.role}</span>
                      </td>
                      <td className="p-3">
                        <span className={`badge text-[10px] ${u.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                          {u.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <select
                          value={u.role}
                          onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                          className="input text-xs py-1 px-2 w-auto inline-block"
                        >
                          <option value="CUSTOMER">CUSTOMER</option>
                          <option value="SUPPORT_AGENT">SUPPORT_AGENT</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: RAG Observability Logs */}
        {activeTab === 'observability' && (
          <div className="card overflow-hidden border-surface-700">
            <div className="p-3 sm:p-4 border-b border-surface-700 bg-surface-850/40 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                RAG Query Observability Logs ({ragLogs.length})
              </h3>
              <button
                onClick={fetchRagLogs}
                className="text-[11px] text-brand-400 hover:text-brand-300"
              >
                Refresh
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 min-w-[640px]">
                <thead className="bg-surface-850/70 text-slate-400 font-semibold border-b border-surface-700">
                  <tr>
                    <th className="p-3">Query</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Support Status</th>
                    <th className="p-3">Model</th>
                    <th className="p-3">Latency</th>
                    <th className="p-3">Escalated?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-700/60 font-mono text-[11px]">
                  {ragLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-800/40">
                      <td className="p-3 font-sans text-xs text-slate-200 max-w-xs truncate">
                        {log.query}
                      </td>
                      <td className="p-3 text-slate-400">{log.query_category}</td>
                      <td className="p-3">
                        <span
                          className={`badge text-[10px] ${
                            log.support_status === 'SUPPORTED'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : log.support_status === 'PARTIALLY_SUPPORTED'
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-red-500/15 text-red-400'
                          }`}
                        >
                          {log.support_status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400 truncate max-w-[140px]">{log.model_used}</td>
                      <td className="p-3 text-slate-300">{log.latency_ms} ms</td>
                      <td className="p-3">
                        {log.escalation_decision ? (
                          <span className="text-amber-400 font-bold">YES</span>
                        ) : (
                          <span className="text-slate-500">NO</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
