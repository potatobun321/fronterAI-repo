import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from './Modal';
import { Video, Calendar, Plus, ExternalLink, Radio, Trash2, Square } from 'lucide-react';

export function CallRoomView() {
  const { isHost } = useAuth();
  const toast = useToast();
  const [meetingData, setMeetingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  // Form
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [eventType, setEventType] = useState('MEETING');
  const [eventDate, setEventDate] = useState('');
  const [timeLabel, setTimeLabel] = useState('11:00 AM IST');
  const [targetAudience, setTargetAudience] = useState('ALL');

  const loadMeetings = async () => {
    try {
      const res = await api.getMeetings();
      setMeetingData(res);
    } catch (e) {
      console.error('Failed to load meetings:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeetings();
    const onWorkspaceUpdate = () => loadMeetings();
    window.addEventListener('frontier:workspace-updated', onWorkspaceUpdate);
    return () => window.removeEventListener('frontier:workspace-updated', onWorkspaceUpdate);
  }, []);

  const handleScheduleMeeting = async (e) => {
    e.preventDefault();
    if (!title.trim() || !eventDate) return;

    try {
      await api.createMeeting({
        title: title.trim(),
        description: desc.trim(),
        event_type: eventType,
        event_date: eventDate,
        time_label: timeLabel.trim(),
        target_audience: targetAudience
      });
      setIsScheduleModalOpen(false);
      setTitle('');
      setDesc('');
      toast.success('Meeting scheduled');
      await loadMeetings();
    } catch (err) {
      toast.error(`Failed to schedule meeting: ${err.message}`);
    }
  };

  const handlePing = async (eventId) => {
    try {
      await api.pingMeeting(eventId);
      toast.success('Meeting is now LIVE');
      await loadMeetings();
    } catch (err) {
      toast.error(`Failed to go live: ${err.message}`);
    }
  };

  const handleEnd = async (eventId) => {
    try {
      await api.endMeeting(eventId);
      toast.info('Live meeting ended');
      await loadMeetings();
    } catch (err) {
      toast.error(`Failed to end meeting: ${err.message}`);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    try {
      await api.deleteCalendarEvent(eventId);
      toast.info('Event deleted');
      await loadMeetings();
    } catch (err) {
      toast.error(`Failed to delete event: ${err.message}`);
    }
  };

  const slots = meetingData?.slots || [];
  const events = meetingData?.events || [];
  const liveEvent = events.find(ev => Number(ev.is_live) === 1);

  return (
    <div className="view-container">
      <div className="view-header">
        <div className="view-title-group">
          <h2>Meeting Rooms</h2>
          <p>Companion bridges and calendar syncs</p>
        </div>

        {isHost && (
          <button className="btn btn-primary" onClick={() => setIsScheduleModalOpen(true)}>
            <Plus size={16} /> Schedule Sync
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading bridge slots...</div>
      ) : (
        <>
          {liveEvent && (
            <div className="card" style={{ border: '1px solid var(--google-green)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--google-green)' }}></span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.94rem' }}>LIVE NOW: {liveEvent.title}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Audience: {liveEvent.target_audience}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(liveEvent.join_url || liveEvent.meeting_link) && (
                  <a href={liveEvent.join_url || `/api/meetings/join/${liveEvent.id}`} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ fontSize: '0.8rem' }}>
                    <Video size={14} /> Join Live Call
                  </a>
                )}
                {isHost && (
                  <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => handleEnd(liveEvent.id)}>
                    <Square size={13} /> End
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Active Companion Bridges */}
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radio size={16} style={{ color: 'var(--google-green)' }} /> Meeting Bridges
            </h3>

            <div className="bridges-grid">
              {slots.map(slot => (
                <div key={slot.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', background: 'var(--bg-surface-elevated)', padding: '2px 8px', borderRadius: 'var(--radius-sm)' }}>
                      {slot.slot_code}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--google-green)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--google-green)' }}></span> Active
                    </span>
                  </div>

                  <div style={{ fontWeight: 600, fontSize: '0.96rem' }}>{slot.slot_name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Last used: {slot.last_used_at ? new Date(slot.last_used_at).toLocaleDateString() : 'Available'}
                  </div>

                  <a
                    href={`/api/meetings/join-slot/${slot.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary"
                    style={{ marginTop: 'auto', width: '100%', fontSize: '0.82rem' }}
                  >
                    <ExternalLink size={14} /> Join Room
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Scheduled Calendar Events */}
          <div style={{ marginTop: '16px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={16} style={{ color: 'var(--google-blue)' }} /> Scheduled Sync Events
            </h3>

            <div className="card table-scroll-wrap" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Event</th>
                    <th>Date & Time</th>
                    <th>Target Audience</th>
                    <th>Bridge Link</th>
                    {isHost && <th>Controls</th>}
                  </tr>
                </thead>
                <tbody>
                  {events.map(ev => (
                    <tr key={ev.id}>
                      <td>
                        <span className={`track-tag ${ev.event_type === 'MEETING' ? 'track-frontend' : ev.event_type === 'RETRO' ? 'track-lead' : 'track-backend'}`}>
                          {ev.event_type}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{ev.title}</span>
                          {Number(ev.is_live) === 1 && (
                            <span style={{ fontSize: '0.68rem', color: 'var(--google-green)', fontWeight: 700 }}>LIVE</span>
                          )}
                        </div>
                        {ev.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{ev.description}</div>}
                      </td>
                      <td>{ev.event_date} at {ev.time_label}</td>
                      <td>{ev.target_audience}</td>
                      <td>
                        {ev.join_url || ev.meeting_link ? (
                          <a
                            href={ev.join_url || `/api/meetings/join/${ev.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.76rem' }}
                          >
                            <Video size={12} /> Enter Call
                          </a>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>None</span>
                        )}
                      </td>
                      {isHost && (
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {Number(ev.is_live) === 1 ? (
                              <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.74rem' }} onClick={() => handleEnd(ev.id)}>
                                End
                              </button>
                            ) : (
                              <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.74rem', color: 'var(--google-green)' }} onClick={() => handlePing(ev.id)}>
                                Go Live
                              </button>
                            )}
                            <button className="btn-icon" style={{ color: 'var(--google-red)', padding: '4px' }} onClick={() => handleDeleteEvent(ev.id)} title="Delete event">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {events.length === 0 && (
                    <tr>
                      <td colSpan={isHost ? 6 : 5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                        No scheduled syncs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Host Schedule Modal */}
      <Modal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        title="Schedule Team Sync (Host Only)"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsScheduleModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleScheduleMeeting}>Publish Event</button>
          </>
        }
      >
        <form onSubmit={handleScheduleMeeting} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label>Meeting Title *</label>
            <input
              className="form-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Sprint Milestone Review & Retrospective"
              required
            />
          </div>

          <div className="form-group">
            <label>Agenda / Description</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Outline sync topics or review criteria..."
            />
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label>Event Type</label>
              <select className="form-select" value={eventType} onChange={e => setEventType(e.target.value)}>
                <option value="MEETING">Sync / Standup</option>
                <option value="RETRO">Sprint Retro</option>
                <option value="DEADLINE">Milestone Deadline</option>
              </select>
            </div>

            <div className="form-group">
              <label>Target Audience</label>
              <select className="form-select" value={targetAudience} onChange={e => setTargetAudience(e.target.value)}>
                <option value="ALL">Entire Team (ALL)</option>
                <option value="frontend">Frontend Track</option>
                <option value="backend">Backend Track</option>
                <option value="lead">Leadership Only</option>
              </select>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label>Date *</label>
              <input
                type="date"
                className="form-input"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Time Label</label>
              <input
                className="form-input"
                value={timeLabel}
                onChange={e => setTimeLabel(e.target.value)}
                placeholder="e.g. 11:00 AM IST"
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
