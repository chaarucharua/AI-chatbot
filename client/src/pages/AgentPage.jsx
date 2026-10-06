/**
 * AgentPage.jsx — Responsive Support Agent dashboard, ticket queue, assignment, and messaging.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/ui/Navbar.jsx';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function AgentPage() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [tickets, setTickets] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [linkedConv, setLinkedConv] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Mobile view switcher: 'queue' or 'detail'
  const [mobileTab, setMobileTab] = useState(ticketId ? 'detail' : 'queue');

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch ticket queue
  const fetchTickets = async () => {
    try {
      const params = {};
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (priorityFilter !== 'ALL') params.priority = priorityFilter;
      if (searchQuery) params.search = searchQuery;

      const res = await api.get('/agent/tickets', { params });
      setTickets(res.data || []);
      return res.data || [];
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
      return [];
    }
  };

  useEffect(() => {
    fetchTickets().then((list) => {
      if (!ticketId && list.length > 0 && window.innerWidth >= 1024) {
        navigate(`/agent/${list[0].id}`, { replace: true });
      }
    });
  }, [statusFilter, priorityFilter, searchQuery]);

  // Fetch active ticket details
  useEffect(() => {
    if (!ticketId) {
      setActiveTicket(null);
      setMobileTab('queue');
      return;
    }

    let isMounted = true;
    setLoading(true);
    setMobileTab('detail');

    api
      .get(`/agent/tickets/${ticketId}`)
      .then((res) => {
        if (isMounted && res.data) {
          setActiveTicket(res.data.ticket);
          setMessages(res.data.messages || []);
          setLinkedConv(res.data.linkedConversation || null);
        }
      })
      .catch((err) => {
        console.error('Failed to load ticket details:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [ticketId]);

  // Update status or priority
  const handleUpdateTicket = async (updates) => {
    if (!activeTicket) return;
    try {
      const res = await api.patch(`/agent/tickets/${activeTicket.id}`, updates);
      setActiveTicket(res.data);
      fetchTickets();
    } catch (err) {
      console.error('Failed to update ticket:', err);
    }
  };

  // Assign to current user
  const handleClaimTicket = () => {
    handleUpdateTicket({
      assigned_agent_id: user.id,
      status: activeTicket.status === 'OPEN' ? 'IN_PROGRESS' : activeTicket.status,
    });
  };

  // Send reply or internal note
  const handleSendReply = async (e) => {
    e?.preventDefault();
    if (!replyText.trim() || sending || !activeTicket) return;

    setSending(true);
    try {
      const res = await api.post(`/agent/tickets/${activeTicket.id}/messages`, {
        content: replyText.trim(),
        is_internal: isInternal,
      });

      setMessages((prev) => [...prev, res.data]);
      setReplyText('');
      fetchTickets();
    } catch (err) {
      console.error('Failed to send ticket reply:', err);
    } finally {
      setSending(false);
    }
  };

  const getPriorityBadge = (priority) => {
    const colors = {
      URGENT: 'badge-urgent',
      HIGH: 'badge-high',
      MEDIUM: 'badge-medium',
      LOW: 'badge-low',
    };
    return <span className={`${colors[priority] || 'badge'} text-[10px]`}>{priority}</span>;
  };

  const getStatusBadge = (status) => {
    const map = {
      OPEN: 'badge-open',
      IN_PROGRESS: 'badge-progress',
      WAITING_FOR_CUSTOMER: 'badge-waiting',
      RESOLVED: 'badge-resolved',
      CLOSED: 'badge-closed',
    };
    return <span className={`${map[status] || 'badge'} text-[10px]`}>{status?.replace(/_/g, ' ')}</span>;
  };

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      <Navbar />

      {/* Mobile subheader tab switcher */}
      <div className="lg:hidden flex border-b border-surface-700 bg-surface-850 p-1">
        <button
          onClick={() => setMobileTab('queue')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
            mobileTab === 'queue' ? 'bg-surface-700 text-slate-100' : 'text-slate-400'
          }`}
        >
          Queue ({tickets.length})
        </button>
        <button
          onClick={() => setMobileTab('detail')}
          disabled={!activeTicket}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 ${
            mobileTab === 'detail' ? 'bg-surface-700 text-slate-100' : 'text-slate-400'
          }`}
        >
          {activeTicket ? activeTicket.ticket_number : 'Ticket Details'}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Queue Sidebar */}
        <aside
          className={`w-full lg:w-96 border-r border-surface-700 bg-surface-900/60 flex flex-col ${
            mobileTab === 'detail' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Filters Bar */}
          <div className="p-3 sm:p-4 border-b border-surface-700 space-y-2.5 bg-surface-850/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Support Queue ({tickets.length})
              </span>
              <button
                onClick={fetchTickets}
                className="text-[11px] text-brand-400 hover:text-brand-300 font-medium"
              >
                Refresh
              </button>
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ticket #, customer, subject..."
              className="input text-xs py-2"
            />

            <div className="grid grid-cols-2 gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input text-xs py-1.5"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="WAITING_FOR_CUSTOMER">Waiting Customer</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="input text-xs py-1.5"
              >
                <option value="ALL">All Priorities</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>

          {/* Ticket Queue List */}
          <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2">
            {tickets.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500">
                No tickets matching filters
              </div>
            ) : (
              tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    navigate(`/agent/${t.id}`);
                    setMobileTab('detail');
                  }}
                  className={`w-full text-left p-3 rounded-xl transition-all ${
                    t.id === ticketId
                      ? 'bg-surface-800 border border-brand-500/40 shadow-md text-slate-100'
                      : 'card-hover'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <span className="font-mono text-xs font-bold text-brand-300">
                      {t.ticket_number}
                    </span>
                    <div className="flex items-center gap-1">
                      {getPriorityBadge(t.priority)}
                      {getStatusBadge(t.status)}
                    </div>
                  </div>

                  <h3 className="text-xs font-semibold text-slate-200 line-clamp-1 mb-1">
                    {t.subject}
                  </h3>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate max-w-[130px]">{t.customer_name}</span>
                    <span className="text-[10px] text-slate-500">
                      {t.agent_name ? `Assigned: ${t.agent_name.split(' ')[0]}` : 'Unassigned'}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Right Ticket Workspace */}
        <main
          className={`flex-1 flex flex-col bg-surface-900 overflow-hidden ${
            mobileTab === 'queue' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {activeTicket ? (
            <>
              {/* Ticket Top Action Bar */}
              <div className="border-b border-surface-700 bg-surface-800/60 p-3 sm:p-4 px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <button
                    onClick={() => setMobileTab('queue')}
                    className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-100 bg-surface-700 text-xs flex items-center gap-1"
                  >
                    ← Queue
                  </button>
                  <span className="font-mono text-sm sm:text-base font-bold text-brand-400 whitespace-nowrap">
                    {activeTicket.ticket_number}
                  </span>
                  <h2 className="text-xs sm:text-sm font-semibold text-slate-100 truncate max-w-[160px] sm:max-w-md">
                    {activeTicket.subject}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={activeTicket.status}
                    onChange={(e) => handleUpdateTicket({ status: e.target.value })}
                    className="input text-xs py-1.5 w-auto"
                  >
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="WAITING_FOR_CUSTOMER">Waiting Customer</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="CLOSED">Closed</option>
                  </select>

                  <select
                    value={activeTicket.priority}
                    onChange={(e) => handleUpdateTicket({ priority: e.target.value })}
                    className="input text-xs py-1.5 w-auto"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>

                  {activeTicket.assigned_agent_id !== user.id && (
                    <button
                      onClick={handleClaimTicket}
                      className="btn-secondary text-xs py-1.5 px-3"
                    >
                      Assign to Me
                    </button>
                  )}
                </div>
              </div>

              {/* Ticket Details & Conversation Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
                {/* Customer and Ticket Metadata Card */}
                <div className="card p-3 sm:p-4 bg-surface-850/60 border-surface-700 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block mb-0.5">Customer</span>
                    <span className="font-semibold text-slate-200">{activeTicket.customer_name}</span>
                    <span className="text-slate-400 block truncate">{activeTicket.customer_email}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Assigned Agent</span>
                    <span className="font-semibold text-slate-200">
                      {activeTicket.agent_name || 'Unassigned'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Escalation Reason</span>
                    <span className="text-amber-300 font-medium">
                      {activeTicket.escalation_reason || 'Manual Ticket'}
                    </span>
                  </div>
                </div>

                {/* Linked Conversation History from AI Bot */}
                {linkedConv && (
                  <div className="card p-3 sm:p-4 border-surface-700 bg-surface-850/30">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                      Original Conversation with AI Assistant
                    </h3>

                    <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                      {linkedConv.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`p-2.5 sm:p-3 rounded-lg text-xs leading-relaxed ${
                            m.sender_type === 'CUSTOMER'
                              ? 'bg-brand-900/30 border border-brand-500/20 text-slate-200 ml-2 sm:ml-4'
                              : m.sender_type === 'BOT'
                              ? 'bg-surface-800 border border-surface-700 text-slate-300 mr-2 sm:mr-4'
                              : 'bg-emerald-950/20 border border-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          <div className="font-semibold text-[10px] text-slate-400 mb-0.5">
                            {m.sender_type === 'CUSTOMER' ? 'Customer' : m.sender_type === 'BOT' ? 'NovaCart AI' : 'Agent'}
                          </div>
                          <div>{m.content}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Threaded Ticket Messages */}
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Ticket Activity & Messages
                  </h3>

                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 sm:p-4 rounded-xl text-xs leading-relaxed border ${
                        msg.is_internal
                          ? 'bg-amber-950/15 border-amber-500/30 text-amber-100'
                          : msg.sender_type === 'AGENT'
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-200'
                          : 'bg-surface-800 border-surface-700 text-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <span className="font-bold text-slate-200">
                            {msg.sender_name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-700 text-slate-300">
                            {msg.sender_type}
                          </span>
                          {msg.is_internal && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold flex items-center gap-1">
                              🔒 Internal Note
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agent Reply Box */}
              <div className="p-3 sm:p-4 border-t border-surface-700 bg-surface-900/90 backdrop-blur-md">
                <form onSubmit={handleSendReply} className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        checked={!isInternal}
                        onChange={() => setIsInternal(false)}
                        className="text-brand-500 focus:ring-brand-500"
                      />
                      <span>Public Reply</span>
                    </label>

                    <label className="flex items-center gap-1.5 text-xs text-amber-300 cursor-pointer">
                      <input
                        type="radio"
                        checked={isInternal}
                        onChange={() => setIsInternal(true)}
                        className="text-amber-500 focus:ring-amber-500"
                      />
                      <span>Internal Note (Team only)</span>
                    </label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <textarea
                      rows={2}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={
                        isInternal
                          ? 'Add internal investigation notes, supervisor review, or resolution notes...'
                          : 'Type your customer support reply...'
                      }
                      className={`input text-xs resize-none flex-1 ${
                        isInternal ? 'border-amber-500/30 focus:border-amber-500' : ''
                      }`}
                    />
                    <button
                      type="submit"
                      disabled={!replyText.trim() || sending}
                      className={`px-4 py-2 sm:py-0 text-xs font-semibold rounded-lg flex items-center justify-center whitespace-nowrap ${
                        isInternal
                          ? 'bg-amber-600 hover:bg-amber-500 text-white'
                          : 'btn-primary'
                      }`}
                    >
                      {sending ? 'Sending...' : isInternal ? 'Save Note' : 'Send Reply'}
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs sm:text-sm p-4 text-center">
              Select a ticket from the queue to view details and reply
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
