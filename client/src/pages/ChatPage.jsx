/**
 * ChatPage.jsx — Responsive customer assistant chat interface with RAG citations and escalation.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/ui/Navbar.jsx';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [expandedSources, setExpandedSources] = useState({});
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    if (!id) return;

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

  const toggleSourceExpand = (msgId) => {
    setExpandedSources((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SUPPORTED':
        return (
          <span className="badge bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30 text-[10px]">
            ✓ Grounded
          </span>
        );
      case 'PARTIALLY_SUPPORTED':
        return (
          <span className="badge bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30 text-[10px]">
            ⚠ Partial
          </span>
        );
      case 'UNSUPPORTED':
        return (
          <span className="badge bg-red-500/15 text-red-400 ring-1 ring-red-500/30 text-[10px]">
            ✕ Unsupported
          </span>
        );
      case 'AMBIGUOUS':
        return (
          <span className="badge bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30 text-[10px]">
            ? Clarify
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      <Navbar />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Slide-Over Backdrop */}
        {mobileDrawerOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMobileDrawerOpen(false)}
          />
        )}

        {/* Sidebar (Desktop permanent, Mobile slide-over drawer) */}
        <aside
          className={`fixed md:static inset-y-0 left-0 z-40 w-72 sm:w-80 border-r border-surface-700 bg-surface-900 flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 ${
            mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="p-4 border-b border-surface-700 flex items-center justify-between gap-2">
            <button
              onClick={handleNewConversation}
              className="btn-primary flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>New Conversation</span>
            </button>

            <button
              onClick={() => setMobileDrawerOpen(false)}
              className="md:hidden p-2 text-slate-400 hover:text-slate-100"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
              Recent Chats ({conversations.length})
            </div>

            {conversations.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                No past conversations yet
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => {
                    navigate(`/chat/${conv.id}`);
                    setMobileDrawerOpen(false);
                  }}
                  className={`w-full text-left p-3 rounded-xl transition-all ${
                    conv.id === id
                      ? 'bg-surface-800 border border-surface-600 shadow-sm text-slate-100'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-surface-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold truncate text-slate-200">
                      {conv.title || 'Support Chat'}
                    </span>
                    {conv.status === 'ESCALATED' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                        Escalated
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">
                    {conv.last_message || 'Start typing a message...'}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Chat Pane */}
        <main className="flex-1 flex flex-col bg-surface-900 overflow-hidden w-full">
          {/* Header */}
          <div className="h-14 border-b border-surface-700 bg-surface-800/40 px-3 sm:px-6 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Mobile toggle sidebar button */}
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(true)}
                className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-surface-700 flex items-center gap-1 text-xs"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                <span className="text-[11px] font-medium hidden xs:inline">Chats</span>
              </button>

              <h1 className="text-xs sm:text-sm font-semibold text-slate-200 truncate max-w-[150px] sm:max-w-md">
                {activeConv?.title || 'NovaCart AI Support Assistant'}
              </h1>
              {activeConv?.status === 'ESCALATED' && (
                <span className="badge bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30 text-[10px] whitespace-nowrap">
                  Escalated
                </span>
              )}
            </div>

            {activeConv && activeConv.status !== 'ESCALATED' && (
              <button
                onClick={() => setShowEscalateModal(true)}
                className="btn-secondary text-[11px] sm:text-xs py-1 sm:py-1.5 px-2.5 sm:px-3 flex items-center gap-1.5 text-amber-400 border-amber-500/30 hover:bg-amber-500/10 whitespace-nowrap"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7 7z" />
                </svg>
                <span className="hidden sm:inline">Speak with Human Agent</span>
                <span className="sm:hidden">Escalate</span>
              </button>
            )}
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
            {messages.length === 0 && !loading && (
              <div className="max-w-md mx-auto text-center py-8 sm:py-16 px-2">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-3xl bg-brand-500/10 border border-brand-500/20 mx-auto flex items-center justify-center text-brand-400 mb-4 shadow-lg shadow-brand-500/10">
                  <svg className="w-7 h-7 sm:w-8 sm:h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h2 className="text-sm sm:text-base font-semibold text-slate-100">
                  How can we help you today?
                </h2>
                <p className="text-xs text-slate-400 mt-1 mb-6">
                  Ask about shipping times, returns, refunds, warranty, or order modifications.
                </p>

                {/* Prompt Suggestions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                  {[
                    'What is the return window for NovaCart purchases?',
                    'How long does standard domestic shipping take?',
                    'What is covered under the 1-Year warranty?',
                    'Can I cancel an order after placing it?',
                  ].map((sample, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInputText(sample)}
                      className="p-2.5 rounded-xl bg-surface-800/80 border border-surface-700 hover:border-brand-500/40 text-xs text-slate-300 hover:text-white transition-all text-left"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => {
              const isCustomer = msg.sender_type === 'CUSTOMER';
              const isBot = msg.sender_type === 'BOT';
              const isAgent = msg.sender_type === 'AGENT';
              const isSystem = msg.sender_type === 'SYSTEM';

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center my-3">
                    <div className="message-system max-w-lg text-[11px] sm:text-xs">
                      <span className="font-semibold text-amber-400">System Notice: </span>
                      {msg.content}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1 px-1">
                    <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400">
                      {isCustomer
                        ? 'You'
                        : isAgent
                        ? 'Support Agent'
                        : 'NovaCart AI'}
                    </span>
                    {isBot && msg.query_category && (
                      <span className="text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded bg-surface-800 text-slate-400 border border-surface-700">
                        {msg.query_category}
                      </span>
                    )}
                    {isBot && getStatusBadge(msg.support_status)}
                  </div>

                  <div
                    className={`max-w-[92%] sm:max-w-2xl p-3 sm:p-4 text-xs sm:text-sm leading-relaxed ${
                      isCustomer
                        ? 'message-customer'
                        : isAgent
                        ? 'message-agent'
                        : 'message-bot'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>

                    {/* Sources section for Bot messages */}
                    {isBot && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-surface-600/60">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                            <svg className="w-3 h-3 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            Grounded Citations ({msg.sources.length})
                          </span>
                          <button
                            onClick={() => toggleSourceExpand(msg.id)}
                            className="text-[10px] text-brand-400 hover:text-brand-300 font-medium"
                          >
                            {expandedSources[msg.id] ? 'Hide' : 'Details'}
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {msg.sources.map((src, idx) => (
                            <span key={idx} className="source-chip text-[10px] sm:text-[11px]">
                              [Source {src.source_number || idx + 1}] {src.title}
                              {src.section && ` (${src.section})`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Offer escalation if unsupported */}
                    {isBot && (msg.support_status === 'UNSUPPORTED' || msg.suggest_escalation) && (
                      <div className="mt-3 p-2 rounded-lg bg-surface-800/80 border border-surface-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                        <span className="text-[11px] sm:text-xs text-slate-300">
                          Need further assistance?
                        </span>
                        <button
                          onClick={() => setShowEscalateModal(true)}
                          className="btn-primary text-xs py-1 px-2.5 whitespace-nowrap self-end sm:self-auto"
                        >
                          Request Support Ticket
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {sending && (
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-[10px] font-semibold text-slate-400">NovaCart AI</span>
                  <span className="text-[10px] text-brand-400 animate-pulse">Consulting Knowledge Base...</span>
                </div>
                <div className="message-bot p-3 sm:p-4 flex items-center gap-2">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-3 sm:p-4 border-t border-surface-700 bg-surface-900/90 backdrop-blur-md">
            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask about returns, warranties, shipping..."
                disabled={sending}
                className="input flex-1 py-2.5 sm:py-3 text-xs sm:text-sm"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || sending}
                className="btn-primary px-3 sm:px-5 py-2.5 sm:py-3 font-semibold text-xs sm:text-sm flex items-center gap-1.5"
              >
                <span>Send</span>
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </form>
          </div>
        </main>
      </div>

      {/* Escalation Modal */}
      {showEscalateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-5 sm:p-6 shadow-2xl border-surface-600 bg-surface-800">
            <h3 className="text-base sm:text-lg font-bold text-slate-100 mb-2">
              Connect with Human Support
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              We'll escalate your conversation into an official support ticket. A dedicated agent will review your case and respond directly in this chat and via ticket queue.
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
                className="btn-primary text-xs py-1.5 px-3"
              >
                {escalating ? 'Creating...' : 'Confirm Escalation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
