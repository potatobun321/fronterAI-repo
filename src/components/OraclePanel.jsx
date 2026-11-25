import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Sparkles, X, Send, Play, CheckCircle, RotateCcw, Trash2 } from 'lucide-react';

const WELCOME_MSG = {
  id: 1,
  role: 'model',
  text: "Hello. I am Frontier Oracle. I can summarize sprint health, prepare task actions, and look up team directory details. How can I assist you?"
};

function parseActionFromContent(text) {
  const match = (text || '').match(/```action\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

export function OraclePanel({ isOpen, onClose }) {
  const { currentUser } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [historyLoadedForUser, setHistoryLoadedForUser] = useState(null);
  const [executedActions, setExecutedActions] = useState({});
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!currentUser) {
      setMessages([WELCOME_MSG]);
      setThreadId(null);
      setHistoryLoadedForUser(null);
      return;
    }
    if (!isOpen || historyLoadedForUser === currentUser.id) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await api.getOracleThreads();
        const latest = res?.threads?.[0];
        if (!latest || cancelled) {
          setHistoryLoadedForUser(currentUser.id);
          return;
        }
        const msgRes = await api.getOracleMessages(latest.id);
        if (cancelled) return;
        const loaded = (msgRes?.messages || []).map(m => ({
          id: m.id,
          role: m.sender_role === 'user' ? 'user' : 'model',
          text: m.content,
          action: m.sender_role === 'model' ? parseActionFromContent(m.content) : null
        }));
        if (loaded.length > 0) {
          setThreadId(latest.id);
          setMessages(loaded);
        }
        setHistoryLoadedForUser(currentUser.id);
      } catch {
        setHistoryLoadedForUser(currentUser.id);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, currentUser?.id, historyLoadedForUser]);

  const handleNewChat = () => {
    setThreadId(null);
    setMessages([WELCOME_MSG]);
    setExecutedActions({});
  };

  const handleClearHistory = async () => {
    try {
      await api.deleteOracleThreads();
      handleNewChat();
      toast.info('Oracle chat history cleared');
    } catch (err) {
      toast.error(`Failed to clear history: ${err.message}`);
    }
  };

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    const newMsgId = Date.now();

    setMessages(prev => [...prev, { id: newMsgId, role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const res = await api.chatOracle(userMsg, threadId);
      if (res && res.reply) {
        setThreadId(res.threadId);
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'model',
            text: res.reply,
            action: res.action
          }
        ]);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'model',
          text: `⚠️ Oracle Error: ${err.message}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteAction = async (msgId, actionObj) => {
    try {
      const actionName = actionObj.action;
      const payload = { ...actionObj };
      delete payload.action;

      const res = await api.executeAction(actionName, payload);
      const successMsg = res.message || 'Action executed successfully';
      setExecutedActions(prev => ({ ...prev, [msgId]: successMsg }));
      window.dispatchEvent(new CustomEvent('frontier:workspace-updated', { detail: { action: actionName } }));
      toast.success(successMsg);
    } catch (err) {
      toast.error(`Action failed: ${err.message}`);
    }
  };

  return (
    <div className={`oracle-drawer ${isOpen ? '' : 'closed'}`}>
      <div className="oracle-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={18} style={{ color: 'var(--google-blue)' }} />
          <span style={{ fontWeight: 600, fontSize: '0.98rem' }}>Frontier Oracle</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button className="btn-icon" onClick={handleNewChat} title="New conversation" aria-label="New conversation">
            <RotateCcw size={15} />
          </button>
          {currentUser && (
            <button className="btn-icon" onClick={handleClearHistory} title="Clear saved history" aria-label="Clear saved history" style={{ color: 'var(--google-red)' }}>
              <Trash2 size={15} />
            </button>
          )}
          <button className="btn-icon" onClick={onClose} aria-label="Close Oracle panel">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="oracle-chat-feed">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-model'}`}
          >
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {msg.text.replace(/```action[\s\S]*?```/g, '').trim()}
            </div>

            {/* Interactive Action Card */}
            {msg.action && (
              <div className="action-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="track-tag track-frontend" style={{ fontSize: '0.68rem' }}>
                    Action: {msg.action.action}
                  </span>
                  {executedActions[msg.id] && (
                    <span style={{ fontSize: '0.74rem', color: 'var(--google-green)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle size={12} /> Executed
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  {msg.action.title && <div><strong>Title:</strong> {msg.action.title}</div>}
                  {msg.action.status && <div><strong>Status:</strong> {msg.action.status}</div>}
                  {msg.action.receiver && <div><strong>To:</strong> @{msg.action.receiver}</div>}
                </div>

                {!executedActions[msg.id] ? (
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '6px 12px', fontSize: '0.78rem' }}
                    onClick={() => handleExecuteAction(msg.id, msg.action)}
                  >
                    <Play size={12} /> Confirm & Execute
                  </button>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: 'var(--google-green)', fontWeight: 500 }}>
                    {executedActions[msg.id]}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="chat-bubble chat-bubble-model" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Oracle is thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="oracle-input-bar" onSubmit={handleSend}>
        <input
          type="text"
          className="form-input"
          placeholder="Ask Oracle or request actions..."
          value={input}
          onChange={e => setInput(e.target.value)}
          style={{ flex: 1, borderRadius: 'var(--radius-pill)', padding: '8px 14px' }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '38px', height: '38px', padding: 0, borderRadius: '50%' }}
          disabled={loading || !input.trim()}
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
