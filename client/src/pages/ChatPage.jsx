/**
 * ChatPage.jsx — ChatGPT-style layout customer assistant interface.
 * Viewport-locked (100dvh), zero window scrollbars, collapsible sidebar,
 * centered message feed, and floating prompt pill.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [selectedSource, setSelectedSource] = useState(null);

  // ChatGPT layout: Desktop sidebar can collapse; Mobile drawer toggles with backdrop
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1024);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Adjust textarea height dynamically up to 120px
  const handleInputChange = (e) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  // Load user's conversations
  const loadConversations = async () => {
    try {
      const res = await api.get('/conversations');
      setConversations(res.data || []);
      return res.data || [];
    } catch (err) {
      console.error('Failed to load conversations:', err);
      return [];
    }
  };

  useEffect(() => {
    loadConversations().then((list) => {
      if (!id && list.length > 0) {
        navigate(`/chat/${list[0].id}`, { replace: true });
      }
    });
  }, []);

  // Load active conversation & messages when id changes
  useEffect(() => {
    if (!id) {
      setActiveConv(null);
      setMessages([]);
      return;
    }

    let isMounted = true;
    setLoading(true);

    api
      .get(`/conversations/${id}`)
      .then((res) => {
        if (isMounted && res.data) {
          setActiveConv(res.data.conversation);
          setMessages(res.data.messages || []);
        }
      })
      .catch((err) => {
        console.error('Failed to load conversation details:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  // Create new conversation
  const handleNewConversation = async () => {
    try {
      const res = await api.post('/conversations', { title: 'New Conversation' });
      await loadConversations();
      setMobileDrawerOpen(false);
      navigate(`/chat/${res.data.id}`);
      if (textareaRef.current) textareaRef.current.focus();
    } catch (err) {
      console.error('Failed to create new conversation:', err);
    }
  };

  // Send message
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!inputText.trim() || sending) return;

    let targetConvId = id;

    if (!targetConvId) {
      try {
        const newConv = await api.post('/conversations', { title: inputText.slice(0, 30) });
        targetConvId = newConv.data.id;
        navigate(`/chat/${targetConvId}`);
      } catch (err) {
        console.error('Failed to create conversation:', err);
        return;
      }
    }

    const messageText = inputText.trim();
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setSending(true);

    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      sender_type: 'CUSTOMER',
      content: messageText,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await api.post(`/conversations/${targetConvId}/messages`, {
        content: messageText,
      });

      if (res.data) {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempUserMsg.id),
          res.data.userMessage,
          res.data.botMessage,
        ]);
        loadConversations();
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  };

  // Handle Enter to send, Shift+Enter for newline
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Escalate conversation
  const handleEscalate = async () => {
    if (!activeConv || escalating) return;
    setEscalating(true);

    try {
      await api.post(`/conversations/${activeConv.id}/escalate`, {
        reason: escalateReason || 'Customer requested human assistance',
      });

      setShowEscalateModal(false);
      setEscalateReason('');

      const updated = await api.get(`/conversations/${activeConv.id}`);
      setActiveConv(updated.data.conversation);
      setMessages(updated.data.messages || []);
      loadConversations();
    } catch (err) {
      console.error('Failed to escalate conversation:', err);
    } finally {
      setEscalating(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SUPPORTED':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Grounded
          </span>
        );
      case 'PARTIALLY_SUPPORTED':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Partial
          </span>
        );
      case 'UNSUPPORTED':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Unsupported
          </span>
        );
      case 'AMBIGUOUS':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> Clarify
          </span>
        );
      default:
        return null;
    }
  };

  const isAgentOrAdmin = ['SUPPORT_AGENT', 'ADMIN'].includes(user?.role);
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="h-full w-full flex overflow-hidden bg-surface-900 text-slate-100">
      {/* ─────────────────────────────────────────────────────────────
          1. Mobile Backdrop Overlay
         ───────────────────────────────────────────────────────────── */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden transition-opacity"
          onClick={() => setMobileDrawerOpen(false)}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. Left Sidebar (ChatGPT-style)
             - Collapsible on Desktop
             - Slide-over Drawer on Mobile
         ───────────────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50
          w-72 sm:w-80 h-full flex flex-col
          bg-surface-950 border-r border-surface-800
          transition-all duration-300 ease-in-out shrink-0
          ${mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${!sidebarOpen ? 'md:hidden' : 'md:flex'}
        `}
      >
        {/* Sidebar Header: Logo & New Chat */}
        <div className="p-3 border-b border-surface-800/80 flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-1">
            <Link to="/chat" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-md shadow-brand-500/20">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-slate-100 tracking-tight">NovaCart</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 font-semibold uppercase">AI</span>
              </div>
            </Link>

            {/* Close drawer on mobile, Collapse on desktop */}
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobileDrawerOpen(false);
                } else {
                  setSidebarOpen(false);
                }
              }}
              title="Close sidebar"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-surface-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {/* New Chat Button */}
          <button
            onClick={handleNewConversation}
            className="w-full py-2.5 px-3 rounded-xl border border-surface-700/80 bg-surface-900/60 hover:bg-surface-800 text-slate-200 text-xs font-semibold flex items-center justify-between transition-all group shadow-sm hover:border-brand-500/40"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-brand-400 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>New chat</span>
            </div>
            <svg className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>

        {/* Scrollable Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1.5">
            Conversations
          </div>

          {conversations.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No conversations yet
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === id;
              return (
                <button
                  key={conv.id}
                  onClick={() => {
                    navigate(`/chat/${conv.id}`);
                    setMobileDrawerOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center justify-between gap-2 group ${
                    isActive
                      ? 'bg-surface-800 text-slate-100 font-medium border border-surface-700/80 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-surface-850/60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <svg className={`w-4 h-4 shrink-0 ${isActive ? 'text-brand-400' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="text-xs truncate">
                      {conv.title || 'Support Chat'}
                    </span>
                  </div>

                  {conv.status === 'ESCALATED' && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-medium shrink-0">
                      Escalated
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Sidebar Footer: Role Switchers & User Profile */}
        <div className="p-3 border-t border-surface-800/80 bg-surface-950/80 space-y-2">
          {/* Staff Switchers */}
          {isAgentOrAdmin && (
            <div className="space-y-1">
              <Link
                to="/agent"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-surface-800 transition-colors"
              >
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span>Agent Workspace</span>
              </Link>

              {isAdmin && (
                <Link
                  to="/admin"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-surface-800 transition-colors"
                >
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span>Admin Console</span>
                </Link>
              )}
            </div>
          )}

          {/* User Account Bar */}
          <div className="pt-2 border-t border-surface-800/60 flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 flex items-center justify-center text-xs font-bold uppercase shrink-0">
                {user?.name?.slice(0, 2) || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-200 truncate">{user?.name}</div>
                <div className="text-[10px] text-slate-500 truncate">{user?.role?.replace('_', ' ')}</div>
              </div>
            </div>

            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-surface-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ─────────────────────────────────────────────────────────────
          3. Main ChatGPT-style Chat Panel
             - Takes remaining width and 100% height
             - Top minimal bar
             - Centered scrollable message feed
             - Fixed bottom floating prompt bar
         ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-surface-900 overflow-hidden relative">
        {/* Top Minimal Header */}
        <header className="h-13 sm:h-14 border-b border-surface-800/80 bg-surface-900/80 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between gap-2 shrink-0 z-20">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Toggle sidebar button (Desktop + Mobile) */}
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobileDrawerOpen(true);
                } else {
                  setSidebarOpen(!sidebarOpen);
                }
              }}
              title="Toggle sidebar"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-surface-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Model Pill (ChatGPT-style model selector) */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-surface-800/80 border border-surface-700/60">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              <span className="text-xs font-semibold text-slate-200">NovaCart AI</span>
              <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">· Gemini 2.5 Flash</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Human Escalation Action */}
            {activeConv && activeConv.status !== 'ESCALATED' && (
              <button
                onClick={() => setShowEscalateModal(true)}
                className="py-1.5 px-3 rounded-xl bg-surface-800 hover:bg-surface-750 text-amber-400 border border-amber-500/30 hover:border-amber-500/50 text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7 7z" />
                </svg>
                <span className="hidden sm:inline">Speak with Human Agent</span>
                <span className="sm:hidden">Escalate</span>
              </button>
            )}

            {activeConv?.status === 'ESCALATED' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Agent Ticket Active</span>
              </span>
            )}
          </div>
        </header>

        {/* ─────────────────────────────────────────────────────────────
            4. Chat Messages Feed (The ONLY scrollable container!)
           ───────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6 min-h-0">
          <div className="max-w-3xl sm:max-w-4xl mx-auto w-full flex flex-col space-y-6">
            {/* Empty State: ChatGPT Centered Greeting & Prompt Cards */}
            {messages.length === 0 && !loading && (
              <div className="py-8 sm:py-16 text-center max-w-2xl mx-auto w-full">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-brand-600/20 to-indigo-500/20 border border-brand-500/30 mx-auto flex items-center justify-center text-brand-400 mb-5 shadow-xl shadow-brand-500/10">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                </div>

                <h2 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
                  How can NovaCart AI help you?
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-2 mb-8 max-w-md mx-auto">
                  Ask about shipping timelines, refund procedures, warranty terms, or order modifications.
                </p>

                {/* 2x2 Prompt Suggestion Cards (ChatGPT style) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
                  {[
                    {
                      title: 'Return Window',
                      desc: 'What is the return policy and return window duration?',
                      prompt: 'What is the return window for NovaCart purchases?',
                    },
                    {
                      title: 'Domestic Shipping',
                      desc: 'Standard vs expedited delivery timelines & rates.',
                      prompt: 'How long does standard domestic shipping take?',
                    },
                    {
                      title: '1-Year Warranty',
                      desc: 'What parts and defects are covered under warranty?',
                      prompt: 'What is covered under the 1-Year manufacturer warranty?',
                    },
                    {
                      title: 'Order Cancellation',
                      desc: 'Can I cancel or edit my order after placement?',
                      prompt: 'Can I cancel an order after placing it?',
                    },
                  ].map((card, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setInputText(card.prompt);
                        if (textareaRef.current) textareaRef.current.focus();
                      }}
                      className="p-3.5 rounded-2xl bg-surface-800/80 border border-surface-700/80 hover:border-brand-500/50 hover:bg-surface-800 text-left transition-all group shadow-sm flex flex-col justify-between"
                    >
                      <span className="text-xs font-semibold text-slate-200 group-hover:text-brand-300 transition-colors">
                        {card.title}
                      </span>
                      <span className="text-[11px] text-slate-400 mt-1 leading-snug">
                        {card.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Render Messages */}
            {messages.map((msg) => {
              const isCustomer = msg.sender_type === 'CUSTOMER';
              const isBot = msg.sender_type === 'BOT';
              const isAgent = msg.sender_type === 'AGENT';
              const isSystem = msg.sender_type === 'SYSTEM';

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-800/90 border border-surface-700 text-amber-300 text-xs shadow-sm">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span>{msg.content}</span>
                    </div>
                  </div>
                );
              }

              // Customer Message (Clean bubble on right)
              if (isCustomer) {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-xl bg-brand-600/90 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-md shadow-brand-900/20 whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // Bot / Agent Message (ChatGPT style left stream)
              return (
                <div key={msg.id} className="flex gap-3 sm:gap-4 items-start">
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-sm ${
                    isAgent
                      ? 'bg-purple-600 text-white'
                      : 'bg-gradient-to-tr from-brand-600 to-indigo-500 text-white'
                  }`}>
                    {isAgent ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7 7z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                  </div>

                  {/* Content Container */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-200">
                        {isAgent ? 'Support Agent' : 'NovaCart AI'}
                      </span>
                      {isBot && msg.query_category && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-800 text-slate-400 border border-surface-700/80">
                          {msg.query_category}
                        </span>
                      )}
                      {isBot && getStatusBadge(msg.support_status)}
                    </div>

                    <div className="text-sm sm:text-[15px] text-slate-200 leading-relaxed whitespace-pre-wrap bg-surface-800/40 p-3 sm:p-4 rounded-2xl border border-surface-800">
                      {msg.content}

                      {/* Source Citations */}
                      {isBot && msg.sources && msg.sources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-surface-700/60">
                          <div className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            <span>Verified Policy Citations</span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {msg.sources.map((src, idx) => (
                              <button
                                key={idx}
                                onClick={() => setSelectedSource(src)}
                                className="px-2.5 py-1 rounded-lg bg-surface-800 hover:bg-surface-700/80 border border-surface-600/80 text-[11px] text-brand-300 font-medium transition-colors flex items-center gap-1"
                              >
                                <span>[Source {src.source_number || idx + 1}]</span>
                                <span className="text-slate-300 truncate max-w-[150px]">{src.title}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Escalation Prompt if unsupported */}
                      {isBot && (msg.support_status === 'UNSUPPORTED' || msg.suggest_escalation) && (
                        <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                          <span className="text-xs text-amber-200">
                            Need dedicated help with your specific account or order?
                          </span>
                          <button
                            onClick={() => setShowEscalateModal(true)}
                            className="py-1 px-3 rounded-lg bg-amber-500 text-black font-semibold text-xs hover:bg-amber-400 transition-colors shrink-0"
                          >
                            Open Support Ticket
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Streaming / Consulting indicator */}
            {sending && (
              <div className="flex gap-3 sm:gap-4 items-start">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex items-center gap-2 bg-surface-800/60 border border-surface-700/60 rounded-2xl px-4 py-3">
                  <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce [animation-delay:0.2s]" />
                  <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce [animation-delay:0.4s]" />
                  <span className="text-xs text-slate-400 ml-2">Consulting verified knowledge base...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            5. Fixed Bottom Floating Prompt Pill (ChatGPT-style)
           ───────────────────────────────────────────────────────────── */}
        <div className="shrink-0 w-full px-3 sm:px-6 pb-3 sm:pb-5 pt-1 bg-gradient-to-t from-surface-900 via-surface-900/90 to-transparent">
          <div className="max-w-3xl sm:max-w-4xl mx-auto w-full">
            <form
              onSubmit={handleSendMessage}
              className="relative flex items-center bg-surface-800/95 border border-surface-700/80 rounded-3xl shadow-2xl shadow-black/40 focus-within:border-brand-500/80 focus-within:ring-1 focus-within:ring-brand-500/40 transition-all p-1.5 sm:p-2"
            >
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Message NovaCart AI (Ask about shipping, returns, warranty)..."
                disabled={sending}
                className="flex-1 bg-transparent border-0 text-slate-100 placeholder:text-slate-400 text-sm sm:text-base px-3 sm:px-4 py-2 focus:outline-none focus:ring-0 resize-none max-h-32 min-h-[40px] leading-relaxed"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || sending}
                title="Send message"
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                  inputText.trim() && !sending
                    ? 'bg-brand-500 text-white hover:bg-brand-400 shadow-md shadow-brand-500/20 active:scale-95'
                    : 'bg-surface-700/50 text-slate-500 cursor-not-allowed'
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
            </form>

            <p className="text-[11px] text-slate-400 text-center mt-2">
              NovaCart AI responses are verified against official policies. Press <span className="font-semibold text-slate-300">Enter</span> to send, <span className="font-semibold text-slate-300">Shift+Enter</span> for new line.
            </p>
          </div>
        </div>
      </main>

      {/* ─────────────────────────────────────────────────────────────
          6. Citation Preview Modal
         ───────────────────────────────────────────────────────────── */}
      {selectedSource && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card max-w-lg w-full p-5 sm:p-6 shadow-2xl border-surface-600 bg-surface-800 rounded-2xl">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-400">
                  Source Reference
                </span>
                <h3 className="text-base font-bold text-slate-100 mt-0.5">
                  {selectedSource.title}
                </h3>
                {selectedSource.section && (
                  <p className="text-xs text-slate-400 mt-0.5">Section: {selectedSource.section}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedSource(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-surface-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="bg-surface-900/80 rounded-xl p-3.5 text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap max-h-60 overflow-y-auto border border-surface-700">
              {selectedSource.snippet || selectedSource.text || 'Document excerpt used for this grounded answer.'}
            </div>

            <div className="mt-4 flex justify-between items-center text-xs text-slate-400">
              <span>Similarity Score: {(selectedSource.similarity * 100).toFixed(1)}%</span>
              <button
                onClick={() => setSelectedSource(null)}
                className="btn-primary text-xs py-1.5 px-4"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          7. Escalation Modal
         ───────────────────────────────────────────────────────────── */}
      {showEscalateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-5 sm:p-6 shadow-2xl border-surface-600 bg-surface-800 rounded-2xl">
            <h3 className="text-base sm:text-lg font-bold text-slate-100 mb-2">
              Connect with Human Support
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              We'll escalate your conversation into an official support ticket. A dedicated agent will review your case and respond directly in this chat.
            </p>

            <div className="mb-4">
              <label className="label text-xs">Reason / Details (optional)</label>
              <textarea
                rows={3}
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                placeholder="Briefly describe what you need assistance with..."
                className="input text-xs resize-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEscalateModal(false)}
                className="btn-ghost text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEscalate}
                disabled={escalating}
                className="btn-primary text-xs py-1.5 px-4"
              >
                {escalating ? 'Creating Ticket...' : 'Confirm Escalation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
