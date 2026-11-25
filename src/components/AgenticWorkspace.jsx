import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Sparkles, Send, Play, CheckCircle, RotateCcw, Trash2,
  Video, Kanban, Vote, Users, Shield, ArrowUpRight, Radio
} from 'lucide-react';

const WELCOME_MSG = {
  id: 'welcome',
  role: 'model',
  text: 'Welcome to Frontier Agentic Space. Ask me to summarize sprint health, dispatch tasklets or anonymous feedback, raise 2-man access tickets, or (if you are Team Lead) allot tasks, host votes, and broadcast live meeting pings.'
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

export function AgenticWorkspace({ onOpenClassicView }) {
  const { currentUser, isHost } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [historyLoadedForUser, setHistoryLoadedForUser] = useState(null);
  const [executedActions, setExecutedActions] = useState({});
  const [pulse, setPulse] = useState({
    myTasks: [],
    allTasksCount: 0,
    liveEvent: null,
    voting: null,
    pendingTasklets: [],
    pendingTickets: []
  });
  const messagesEndRef = useRef(null);

  const loadPulse = async () => {
    try {
      const [tasksRes, meetingsRes, votingRes] = await Promise.all([
        api.getTasks().catch(() => ({ tasks: [] })),
        api.getMeetings().catch(() => ({ events: [] })),
        api.getVotingCurrent().catch(() => null)
      ]);
      const tasks = tasksRes?.tasks || [];
      const myTasks = currentUser ? tasks.filter(t => t.assignee_id === currentUser.id && t.status !== 'COMPLETED') : [];
      const events = meetingsRes?.events || [];
      const liveEvent = events.find(ev => Number(ev.is_live) === 1) || null;

      let pendingTasklets = [];
      let pendingTickets = [];
      if (currentUser) {
        const [taskletsRes, ticketsRes] = await Promise.all([
          api.getTasklets().catch(() => ({ tasklets: [] })),
          api.getTickets().catch(() => ({ tickets: [] }))
        ]);
        pendingTasklets = (taskletsRes?.tasklets || []).filter(t => t.receiver_id === currentUser.id && t.status !== 'DONE');
        pendingTickets = (ticketsRes?.tickets || []).filter(tk => tk.status === 'PENDING_APPROVAL');
      }

      setPulse({
        myTasks,
        allTasksCount: tasks.filter(t => t.status !== 'COMPLETED').length,
        liveEvent,
        voting: votingRes?.session || null,
        pendingTasklets,
        pendingTickets
      });
    } catch { }
  };

  useEffect(() => {
    loadPulse();
    const onUpdate = () => loadPulse();
    window.addEventListener('frontier:workspace-updated', onUpdate);
    return () => window.removeEventListener('frontier:workspace-updated', onUpdate);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) {
      setMessages([WELCOME_MSG]);
      setThreadId(null);
      setHistoryLoadedForUser(null);
      return;
    }
    if (historyLoadedForUser === currentUser.id) return;

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
  }, [currentUser?.id, historyLoadedForUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendPrompt = async (promptText) => {
    const trimmed = (promptText || '').trim();
    if (!trimmed || loading) return;
    if (!currentUser) {
      toast.info('Please sign in first to use Frontier Oracle.');
      return;
    }

    setInput('');
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text: trimmed }]);
    setLoading(true);
    try {
      const res = await api.chatOracle(trimmed, threadId);
      if (res?.reply) {
        setThreadId(res.threadId);
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'model',
            text: res.reply,
            action: res.action || parseActionFromContent(res.reply)
          }
        ]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'model', text: `⚠️ Oracle Error: ${err.message}` }]);
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

  const memberChips = [
    { label: 'Summarize my sprint', prompt: 'Summarize my active sprint tasks and deadlines' },
    { label: 'Send a tasklet', prompt: 'Send a tasklet to @' },
    { label: 'Send anonymous feedback', prompt: 'Send anonymous feedback kudos to @' },
    { label: 'Raise 2-man ticket', prompt: 'Raise ticket: Temporary D1 migration access' },
    { label: 'Update task status', prompt: 'Update task #1 to IN_PROGRESS' }
  ];

  const hostChips = [
    { label: 'Allot new task', prompt: 'Create task: ' },
    { label: 'Host peer vote', prompt: 'Launch a peer performance voting session' },
    { label: 'Close active vote', prompt: 'Close active voting session and reveal tally' },
    { label: 'Schedule sync', prompt: 'Schedule meeting: Sprint Alignment Sync' },
    { label: 'Go live on call', prompt: 'Go live on the latest scheduled meeting' }
  ];

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '20px', padding: '20px 24px', overflow: 'hidden' }}>
      {/* Left: AI-First Command & Conversation Canvas */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', minHeight: 0 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={18} style={{ color: 'var(--google-blue)' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Frontier Agentic Workspace</span>
                {currentUser && (
                  <span className={`track-tag ${isHost ? 'track-lead' : 'track-backend'}`} style={{ fontSize: '0.66rem' }}>
                    {isHost ? 'TEAM LEAD' : 'CONTRIBUTOR'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                {currentUser
                  ? `Signed in as ${currentUser.name} • ${isHost ? 'Full administrative & workspace agency' : 'Member-scoped actions (tasklets, feedback, tickets, own tasks)'}`
                  : 'Sign in to unlock personalized workspace actions'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="btn-icon" onClick={handleNewChat} title="New conversation">
              <RotateCcw size={15} />
            </button>
            {currentUser && (
              <button className="btn-icon" onClick={handleClearHistory} title="Clear saved history" style={{ color: 'var(--google-red)' }}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Role-Aware Quick Action Chips */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexWrap: 'wrap', gap: '6px', background: 'var(--bg-surface-elevated)' }}>
          {memberChips.map(c => (
            <button
              key={c.label}
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.74rem', borderRadius: 'var(--radius-pill)' }}
              onClick={() => (c.prompt.endsWith('@') || c.prompt.endsWith(': ') ? setInput(c.prompt) : sendPrompt(c.prompt))}
            >
              {c.label}
            </button>
          ))}
          {isHost && hostChips.map(c => (
            <button
              key={c.label}
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.74rem', borderRadius: 'var(--radius-pill)', borderColor: 'var(--google-amber)', color: 'var(--google-amber-text)' }}
              onClick={() => (c.prompt.endsWith(': ') ? setInput(c.prompt) : sendPrompt(c.prompt))}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Chat Feed */}
        <div className="oracle-chat-feed" style={{ flex: 1, padding: '18px' }}>
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-model'}`}
              style={{ maxWidth: '82%' }}
            >
              <div style={{ whiteSpace: 'pre-wrap' }}>
                {msg.text.replace(/```action[\s\S]*?```/g, '').trim()}
              </div>

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
                    {msg.action.assigned_to && <div><strong>Assignee:</strong> @{msg.action.assigned_to}</div>}
                    {msg.action.receiver && <div><strong>To:</strong> @{msg.action.receiver}</div>}
                    {msg.action.is_anonymous && <div><strong>Mode:</strong> Anonymous</div>}
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
            <div className="chat-bubble chat-bubble-model">
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Oracle is thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form
          className="oracle-input-bar"
          onSubmit={(e) => { e.preventDefault(); sendPrompt(input); }}
        >
          <input
            type="text"
            className="form-input"
            placeholder={currentUser ? 'Tell Frontier Oracle what to do...' : 'Sign in to command Frontier Oracle...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            style={{ flex: 1, borderRadius: 'var(--radius-pill)', padding: '9px 16px' }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '40px', height: '40px', padding: 0, borderRadius: '50%' }}
            disabled={loading || !input.trim() || !currentUser}
          >
            <Send size={15} />
          </button>
        </form>
      </div>

      {/* Right: Live Workspace Pulse Rail */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
        {pulse.liveEvent && (
          <div className="card" style={{ border: '1px solid var(--google-green)', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--google-green)', fontWeight: 600, fontSize: '0.8rem', marginBottom: '6px' }}>
              <Radio size={14} /> LIVE MEETING NOW
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px' }}>{pulse.liveEvent.title}</div>
            {(pulse.liveEvent.join_url || pulse.liveEvent.meeting_link) && (
              <a
                href={pulse.liveEvent.join_url || `/api/meetings/join/${pulse.liveEvent.id}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                style={{ width: '100%', fontSize: '0.78rem' }}
              >
                <Video size={14} /> Join Live Call
              </a>
            )}
          </div>
        )}

        <div className="card" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontWeight: 600, fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Kanban size={15} style={{ color: 'var(--google-blue)' }} /> My Active Tasks ({pulse.myTasks.length})
            </span>
            <button className="btn-icon" style={{ fontSize: '0.72rem' }} onClick={() => onOpenClassicView('tasks')} title="Open Classic Tasks Board">
              <ArrowUpRight size={14} />
            </button>
          </div>
          {pulse.myTasks.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {pulse.myTasks.slice(0, 4).map(t => (
                <div key={t.id} style={{ fontSize: '0.78rem', padding: '6px 8px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontWeight: 500 }}>#{t.id} {t.title}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.status} • {t.track}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              {pulse.allTasksCount} active sprint tasks total.
            </div>
          )}
        </div>

        <div className="card" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontWeight: 600, fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Vote size={15} style={{ color: 'var(--google-purple)' }} /> Consensus Booth
            </span>
            <button className="btn-icon" onClick={() => onOpenClassicView('voting')} title="Open Peer Review">
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {pulse.voting ? `${pulse.voting.title} (${pulse.voting.status})` : 'No active voting session.'}
          </div>
        </div>

        <div className="card" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontWeight: 600, fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={15} style={{ color: 'var(--google-green)' }} /> Inbox & Tasklets ({pulse.pendingTasklets.length})
            </span>
            <button className="btn-icon" onClick={() => onOpenClassicView('peers')} title="Open Team & Peers">
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {pulse.pendingTasklets.length > 0
              ? `${pulse.pendingTasklets.length} pending peer tasklet(s)/feedback.`
              : 'Your peer inbox is clear.'}
          </div>
        </div>

        <div className="card" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontWeight: 600, fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={15} style={{ color: 'var(--google-amber)' }} /> 2-Man Governance ({pulse.pendingTickets.length})
            </span>
            <button className="btn-icon" onClick={() => onOpenClassicView('settings')} title="Open Governance">
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {pulse.pendingTickets.length > 0
              ? `${pulse.pendingTickets.length} ticket(s) awaiting peer sign-off.`
              : 'No pending governance tickets.'}
          </div>
        </div>
      </div>
    </div>
  );
}
