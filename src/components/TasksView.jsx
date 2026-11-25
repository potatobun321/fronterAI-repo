import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from './Modal';
import { ConfirmModal } from './ConfirmModal';
import { Plus, CheckCircle2, Clock, AlertCircle, ExternalLink, Trash2 } from 'lucide-react';

export function TasksView() {
  const { currentUser, isHost, members } = useAuth();
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTrack, setFilterTrack] = useState('all');
  const [mode, setMode] = useState('all'); // 'all' or 'mine'

  // Modals
  const [isAllotModalOpen, setIsAllotModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [occError, setOccError] = useState(null);

  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTrack, setNewTrack] = useState('backend');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [newDeadline, setNewDeadline] = useState('');

  // Update states
  const [updateStatus, setUpdateStatus] = useState('');
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [deliverableNotes, setDeliverableNotes] = useState('');

  const loadTasks = async () => {
    try {
      const res = await api.getTasks();
      if (res && res.tasks) setTasks(res.tasks);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    const onWorkspaceUpdate = () => loadTasks();
    window.addEventListener('frontier:workspace-updated', onWorkspaceUpdate);
    return () => window.removeEventListener('frontier:workspace-updated', onWorkspaceUpdate);
  }, []);

  const handleAllotTask = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      await api.createTask({
        title: newTitle.trim(),
        description: newDesc.trim(),
        track: newTrack,
        assignee_id: newAssigneeId ? parseInt(newAssigneeId, 10) : currentUser?.id,
        deadline: newDeadline || undefined
      });
      setIsAllotModalOpen(false);
      setNewTitle('');
      setNewDesc('');
      toast.success('Task created successfully');
      window.dispatchEvent(new CustomEvent('frontier:workspace-updated'));
      await loadTasks();
    } catch (err) {
      toast.error(`Error allotting task: ${err.message}`);
    }
  };

  const openUpdateModal = (task) => {
    setSelectedTask(task);
    setUpdateStatus(task.status);
    setDeliverableUrl(task.deliverable_url || '');
    setDeliverableNotes(task.deliverable_notes || '');
    setOccError(null);
    setIsUpdateModalOpen(true);
  };

  const handleUpdateTask = async (e) => {
    e.preventDefault();
    if (!selectedTask) return;

    try {
      await api.updateTask(selectedTask.id, {
        status: updateStatus,
        deliverable_url: deliverableUrl.trim(),
        deliverable_notes: deliverableNotes.trim(),
        version: selectedTask.version // OCC version lock check
      });
      setIsUpdateModalOpen(false);
      setSelectedTask(null);
      toast.success('Task updated');
      window.dispatchEvent(new CustomEvent('frontier:workspace-updated'));
      await loadTasks();
    } catch (err) {
      if (err.status === 409) {
        setOccError(err.data?.error || 'Concurrency conflict: this task was modified by another peer.');
        toast.error('Version conflict: task was modified elsewhere');
      } else {
        toast.error(`Failed to update task: ${err.message}`);
      }
    }
  };

  const handleDeleteTask = async () => {
    if (!selectedTask) return;
    try {
      await api.deleteTask(selectedTask.id);
      setIsDeleteConfirmOpen(false);
      setIsUpdateModalOpen(false);
      setSelectedTask(null);
      toast.info('Task deleted');
      window.dispatchEvent(new CustomEvent('frontier:workspace-updated'));
      await loadTasks();
    } catch (err) {
      toast.error(`Failed to delete task: ${err.message}`);
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    if (mode === 'mine' && currentUser && t.assignee_id !== currentUser.id) return false;
    if (filterTrack !== 'all' && t.track !== filterTrack) return false;
    return true;
  });

  const columns = [
    { id: 'TODO', label: 'To Do', color: 'var(--text-muted)' },
    { id: 'IN_PROGRESS', label: 'In Progress', color: 'var(--google-blue)' },
    { id: 'REVIEW', label: 'In Review', color: 'var(--google-purple)' },
    { id: 'COMPLETED', label: 'Completed', color: 'var(--google-green)' }
  ];

  return (
    <div className="view-container">
      <div className="view-header">
        <div className="view-title-group">
          <h2>Tasks</h2>
          <p>Sprint deliverables and progress board</p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Track Filters */}
          <div style={{ display: 'flex', background: 'var(--bg-surface)', padding: '3px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border-subtle)' }}>
            {['all', 'frontend', 'backend', 'lead'].map(tr => (
              <button
                key={tr}
                onClick={() => setFilterTrack(tr)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 500,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  background: filterTrack === tr ? 'var(--google-blue-container)' : 'transparent',
                  color: filterTrack === tr ? 'var(--google-blue-text)' : 'var(--text-secondary)'
                }}
              >
                {tr}
              </button>
            ))}
          </div>

          {/* Mode Switcher */}
          <div style={{ display: 'flex', background: 'var(--bg-surface)', padding: '3px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => setMode('all')}
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-pill)',
                border: 'none',
                fontSize: '0.78rem',
                cursor: 'pointer',
                background: mode === 'all' ? 'var(--google-blue-container)' : 'transparent',
                color: mode === 'all' ? 'var(--google-blue-text)' : 'var(--text-secondary)'
              }}
            >
              All Tasks
            </button>
            <button
              onClick={() => setMode('mine')}
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-pill)',
                border: 'none',
                fontSize: '0.78rem',
                cursor: 'pointer',
                background: mode === 'mine' ? 'var(--google-blue-container)' : 'transparent',
                color: mode === 'mine' ? 'var(--google-blue-text)' : 'var(--text-secondary)'
              }}
            >
              Mine
            </button>
          </div>

          {/* Host Only Allot Task */}
          {isHost && (
            <button className="btn btn-primary" onClick={() => setIsAllotModalOpen(true)}>
              <Plus size={16} /> Allot Task
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading tasks...</div>
      ) : (
        <div className="kanban-board">
          {columns.map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.id);
            return (
              <div key={col.id} className="kanban-col">
                <div className="kanban-col-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: col.color }}></span>
                    <span>{col.label}</span>
                  </div>
                  <span style={{ fontSize: '0.78rem', opacity: 0.6 }}>{colTasks.length}</span>
                </div>

                <div className="kanban-col-tasks">
                  {colTasks.map(task => (
                    <div key={task.id} className="task-card" onClick={() => openUpdateModal(task)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <span className={`track-tag track-${task.track}`}>{task.track}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>v{task.version}</span>
                      </div>
                      <div className="task-card-title">{task.title}</div>
                      {task.description && <div className="task-card-desc">{task.description}</div>}

                      <div className="task-card-footer">
                        <span>@{task.assignee_handle || 'unassigned'}</span>
                        {task.deadline && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} /> {task.deadline}
                          </span>
                        )}
                      </div>

                      {task.deliverable_url && (
                        <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: 'var(--google-blue)' }}>
                          <ExternalLink size={12} /> Deliverable Attached
                        </div>
                      )}
                    </div>
                  ))}

                  {colTasks.length === 0 && (
                    <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Host Allot Task Modal */}
      <Modal
        isOpen={isAllotModalOpen}
        onClose={() => setIsAllotModalOpen(false)}
        title="Allot New Sprint Task (Host Only)"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsAllotModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAllotTask}>Create Task</button>
          </>
        }
      >
        <form onSubmit={handleAllotTask} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label>Task Title *</label>
            <input
              className="form-input"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="e.g. Implement Google OAuth State Verification"
              required
            />
          </div>

          <div className="form-group">
            <label>Description / Deliverable Specs</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Provide context, acceptance criteria or PR requirements..."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label>Track</label>
              <select className="form-select" value={newTrack} onChange={e => setNewTrack(e.target.value)}>
                <option value="backend">Backend</option>
                <option value="frontend">Frontend</option>
                <option value="lead">Lead</option>
              </select>
            </div>

            <div className="form-group">
              <label>Assignee</label>
              <select className="form-select" value={newAssigneeId} onChange={e => setNewAssigneeId(e.target.value)}>
                <option value="">Select teammate...</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.name} (@{m.handle})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Target Deadline</label>
            <input
              type="date"
              className="form-input"
              value={newDeadline}
              onChange={e => setNewDeadline(e.target.value)}
            />
          </div>
        </form>
      </Modal>

      {/* Task Update & Deliverable Modal */}
      <Modal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        title={`Task #${selectedTask?.id}: ${selectedTask?.title}`}
        footer={
          <>
            {isHost && selectedTask && (
              <button
                className="btn btn-secondary"
                style={{ marginRight: 'auto', color: 'var(--google-red)' }}
                onClick={() => setIsDeleteConfirmOpen(true)}
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setIsUpdateModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleUpdateTask}>Save Progress</button>
          </>
        }
      >
        {occError && (
          <div style={{ background: 'var(--google-red-container)', color: 'var(--google-red-text)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} />
            <div>{occError}</div>
          </div>
        )}

        <form onSubmit={handleUpdateTask} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label>Status Transition</label>
            <select className="form-select" value={updateStatus} onChange={e => setUpdateStatus(e.target.value)}>
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="REVIEW">In Review</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          <div className="form-group">
            <label>Deliverable Link (GitHub PR, Commit, or Docs URL)</label>
            <input
              className="form-input"
              value={deliverableUrl}
              onChange={e => setDeliverableUrl(e.target.value)}
              placeholder="https://github.com/..."
            />
          </div>

          <div className="form-group">
            <label>Deliverable Notes</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={deliverableNotes}
              onChange={e => setDeliverableNotes(e.target.value)}
              placeholder="Notes on PR merge, testing status, or architecture..."
            />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDeleteTask}
        title="Delete Sprint Task"
        message={`Permanently delete Task #${selectedTask?.id} ("${selectedTask?.title}")?`}
        confirmText="Delete Task"
        isDestructive={true}
      />
    </div>
  );
}
