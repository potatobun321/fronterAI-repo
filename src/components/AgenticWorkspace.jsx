import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Sparkles, Send, Play, CheckCircle, RotateCcw, Trash2,
  Video, Kanban, Vote, Users, Shield, ArrowUpRight, Radio, Slash, ChevronDown, ChevronUp
} from 'lucide-react';

const WELCOME_MSG = {
  id: 'welcome',
  role: 'model',
  text: 'Ready to help with sprint status, peer tasklets, 2-man access tickets, and workspace actions.'
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
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [showMobilePulse, setShowMobilePulse] = useState(false);
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
    setShowSlashMenu(false);
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
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'model', text: `Oracle Error: ${err.message}` }]);
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

  const slashCommands = [
    { cmd: '/sprint', label: 'Summarize my sprint', desc: 'Active tasks, deadlines, and blockers', prompt: 'Summarize my active sprint tasks and deadlines', hostOnly: false },
    { cmd: '/tasklet', label: 'Send a peer tasklet', desc: 'Ping a teammate with a quick micro-task', prompt: 'Send a tasklet to @', hostOnly: false },
    { cmd: '/kudos', label: 'Send anonymous feedback', desc: 'Deliver private or kudos feedback', prompt: 'Send anonymous feedback kudos to @', hostOnly: false },
    { cmd: '/ticket', label: 'Raise 2-man access ticket', desc: 'Request peer-approved elevation', prompt: 'Raise ticket: Temporary D1 migration access', hostOnly: false },
    { cmd: '/allot', label: 'Allot sprint task', desc: 'Create and assign a new task', prompt: 'Create task: ', hostOnly: true },
    { cmd: '/vote', label: 'Host peer review vote', desc: 'Launch an anonymous ballot round', prompt: 'Launch a peer performance voting session', hostOnly: true },
    { cmd: '/sync', label: 'Schedule team sync', desc: 'Create a calendar event & slot', prompt: 'Schedule meeting: Sprint Alignment Sync', hostOnly: true }
  ].filter(c => !c.hostOnly || isHost);

  const starterCards = [
    { title: 'Sprint Pulse', desc: 'Check my active tasks and upcoming deadlines', prompt: 'Summarize my active sprint tasks and deadlines' },
    { title: 'Peer Tasklet', desc: 'Send a quick micro-task or ping to a teammate', prompt: 'Send a tasklet to @' },
    { title: 'Team Roster', desc: 'See who is on backend, frontend, and lead tracks', prompt: 'Who is on the team and what are their roles?' },
    isHost
      ? { title: 'Allot Task', desc: 'Create and assign a sprint deliverable', prompt: 'Create task: ' }
      : { title: '2-Man Ticket', desc: 'Raise a peer-approved access request', prompt: 'Raise ticket: Temporary D1 migration access' }
  ];

  const isFreshWelcome = messages.length === 1 && messages[0].id === 'welcome';

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    setShowSlashMenu(val.startsWith('/'));
  };

  const applySlashCommand = (cmdObj) => {
    setShowSlashMenu(false);
    if (cmdObj.prompt.endsWith('@') || cmdObj.prompt.endsWith(': ')) {
      setInput(cmdObj.prompt);
    } else {
      sendPrompt(cmdObj.prompt);
    }
  };

  return (
    <div className="agentic-layout">
      {/* Compact Mobile Pulse Strip (hidden on desktop > 1024px) */}
      <div className="mobile-pulse-strip">
        <button
          className="btn btn-secondary"
          style={{ padding: '5px 11px', fontSize: '0.74rem' }}
          onClick={() => setShowMobilePulse(prev => !prev)}
        >
          <span>Pulse</span>
          {showMobilePulse ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {pulse.liveEvent && (
          <a
            href={pulse.liveEvent.join_url || `/api/meetings/join/${pulse.liveEvent.id}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary"
            style={{ padding: '5px 11px', fontSize: '0.74rem', textDecoration: 'none', background: 'var(--google-green)', borderColor: 'var(--google-green)' }}
          >
            <Radio size={12} /> Live Call
          </a>
        )}

        <button
          className="btn btn-secondary"
          style={{ padding: '5px 11px', fontSize: '0.74rem' }}
          onClick={() => onOpenClassicView('tasks')}
        >
          <Kanban size={12} style={{ color: 'var(--google-blue)' }} />
          Tasks ({pulse.myTasks.length}/{pulse.allTasksCount})
        </button>

        <button
          className="btn btn-secondary"
          style={{ padding: '5px 11px', fontSize: '0.74rem' }}
          onClick={() => onOpenClassicView('peers')}
        >
          <Users size={12} style={{ color: 'var(--google-green)' }} />
          Inbox ({pulse.pendingTasklets.length})
        </button>

        {pulse.voting && (
          <button
            className="btn btn-secondary"
            style={{ padding: '5px 11px', fontSize: '0.74rem' }}
            onClick={() => onOpenClassicView('voting')}
          >
            <Vote size={12} style={{ color: 'var(--google-purple)' }} />
            Vote {pulse.voting.status}
          </button>
        )}
      </div>

      {/* Left: AI Command & Conversation Canvas */}
      <div className="card agentic-chat-pane">
        <div className="agentic-chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '10px',
              background: 'var(--google-blue-container)', color: 'var(--google-blue)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <Sparkles size={17} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>Frontier Command</span>
                {currentUser && (
                  <span className={`track-tag ${isHost ? 'track-lead' : 'track-backend'}`} style={{ fontSize: '0.62rem' }}>
                    {isHost ? 'TEAM LEAD' : 'CONTRIBUTOR'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentUser
                  ? `Signed in as ${currentUser.name} • Type / for quick commands`
                  : 'Sign in to unlock personalized workspace actions'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button className="btn-icon" onClick={handleNewChat} title="New conversation">
              <RotateCcw size={14} />
            </button>
            {currentUser && (
              <button className="btn-icon" onClick={handleClearHistory} title="Clear saved history" style={{ color: 'var(--google-red)' }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Chat Feed or Clean Empty State */}
        <div className="oracle-chat-feed">
          {isFreshWelcome ? (
            <div className="agentic-empty-state">
              <div style={{
                width: '44px', height: '44px', borderRadius: '14px', margin: '0 auto 12px',
                background: 'var(--google-blue-container)', color: 'var(--google-blue)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Sparkles size={22} />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px' }}>
                What should we get done?
              </h3>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {WELCOME_MSG.text}
              </p>

              <div className="agentic-starter-grid">
                {starterCards.map(card => (
                  <button
                    key={card.title}
                    className="agentic-starter-card"
                    onClick={() => (card.prompt.endsWith('@') || card.prompt.endsWith(': ') ? setInput(card.prompt) : sendPrompt(card.prompt))}
                  >
                    <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>{card.title}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>{card.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-model'}`}
              >
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {msg.text.replace(/```action[\s\S]*?```/g, '').trim()}
                </div>

                {msg.action && (
                  <div className="action-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span className="track-tag track-frontend">
                        Action: {msg.action.action}
                      </span>
                      {executedActions[msg.id] && (
                        <span style={{ fontSize: '0.74rem', color: 'var(--google-green)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle size={12} /> Executed
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {msg.action.title && <div><strong>Title:</strong> {msg.action.title}</div>}
                      {msg.action.status && <div><strong>Status:</strong> {msg.action.status}</div>}
                      {msg.action.assigned_to && <div><strong>Assignee:</strong> @{msg.action.assigned_to}</div>}
                      {msg.action.receiver && <div><strong>To:</strong> @{msg.action.receiver}</div>}
                      {msg.action.is_anonymous && <div><strong>Mode:</strong> Anonymous</div>}
                    </div>

                    {!executedActions[msg.id] ? (
                      <button
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '7px 12px', fontSize: '0.78rem' }}
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
            ))
          )}
          {loading && (
            <div className="chat-bubble chat-bubble-model">
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Oracle is thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar with Slash Command Menu */}
        <form
          className="oracle-input-bar"
          onSubmit={(e) => { e.preventDefault(); sendPrompt(input); }}
        >
          {showSlashMenu && (
            <div className="slash-menu">
              {slashCommands.map(c => (
                <button
                  key={c.cmd}
                  type="button"
                  className="slash-item"
                  onClick={() => applySlashCommand(c)}
                >
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--google-blue)', fontWeight: 600, marginRight: '8px' }}>
                      {c.cmd}
                    </span>
                    <span style={{ fontWeight: 500 }}>{c.label}</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.desc}</span>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="btn-icon"
            title="Slash commands"
            onClick={() => setShowSlashMenu(prev => !prev)}
          >
            <Slash size={14} />
          </button>

          <input
            type="text"
            className="form-input"
            placeholder={currentUser ? 'Ask Frontier Oracle or type / for commands...' : 'Sign in to command Frontier Oracle...'}
            value={input}
            onChange={handleInputChange}
            style={{ flex: 1, borderRadius: 'var(--radius-pill)', padding: '9px 16px' }}
          />

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '38px', height: '38px', padding: 0, borderRadius: '50%', flexShrink: 0 }}
            disabled={loading || !input.trim() || !currentUser}
          >
            <Send size={15} />
          </button>
        </form>
      </div>

      {/* Right: Live Workspace Pulse Rail (stacks cleanly when toggled on mobile) */}
      <div className={`agentic-pulse-rail ${showMobilePulse ? 'mobile-expanded' : ''}`}>
        {pulse.liveEvent && (
          <div className="card" style={{ border: '1px solid var(--google-green)', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--google-green)', fontWeight: 600, fontSize: '0.78rem', marginBottom: '6px' }}>
              <Radio size={14} /> LIVE MEETING NOW
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '10px' }}>{pulse.liveEvent.title}</div>
            {(pulse.liveEvent.join_url || pulse.liveEvent.meeting_link) && (
              <a
                href={pulse.liveEvent.join_url || `/api/meetings/join/${pulse.liveEvent.id}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                style={{ width: '100%', fontSize: '0.78rem', textDecoration: 'none' }}
              >
                <Video size={14} /> Join Live Call
              </a>
            )}
          </div>
        )}

        <div className="card" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontWeight: 600, fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Kanban size={15} style={{ color: 'var(--google-blue)' }} /> My Active Tasks ({pulse.myTasks.length})
            </span>
            <button className="btn-icon" style={{ width: '28px', height: '28px' }} onClick={() => onOpenClassicView('tasks')} title="Open Tasks Board">
              <ArrowUpRight size={13} />
            </button>
          </div>
          {pulse.myTasks.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {pulse.myTasks.slice(0, 4).map(t => (
                <div key={t.id} style={{ fontSize: '0.78rem', padding: '7px 9px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontWeight: 500 }}>#{t.id} {t.title}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{t.status} • {t.track}</div>
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
            <span style={{ fontWeight: 600, fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Vote size={15} style={{ color: 'var(--google-purple)' }} /> Consensus Booth
            </span>
            <button className="btn-icon" style={{ width: '28px', height: '28px' }} onClick={() => onOpenClassicView('voting')} title="Open Peer Review">
              <ArrowUpRight size={13} />
            </button>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {pulse.voting ? `${pulse.voting.title} (${pulse.voting.status})` : 'No active voting session.'}
          </div>
        </div>

        <div className="card" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontWeight: 600, fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={15} style={{ color: 'var(--google-green)' }} /> Inbox & Tasklets ({pulse.pendingTasklets.length})
            </span>
            <button className="btn-icon" style={{ width: '28px', height: '28px' }} onClick={() => onOpenClassicView('peers')} title="Open Team & Peers">
              <ArrowUpRight size={13} />
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
            <span style={{ fontWeight: 600, fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={15} style={{ color: 'var(--google-amber)' }} /> 2-Man Governance ({pulse.pendingTickets.length})
            </span>
            <button className="btn-icon" style={{ width: '28px', height: '28px' }} onClick={() => onOpenClassicView('settings')} title="Open Governance">
              <ArrowUpRight size={13} />
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
