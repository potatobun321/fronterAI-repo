import React from 'react';
import { Modal } from './Modal';
import { AlertTriangle } from 'lucide-react';

export function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', isDestructive = false }) {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${isDestructive ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', padding: '4px 0' }}>
        {isDestructive && (
          <div style={{ background: 'var(--google-red-container)', padding: '8px', borderRadius: '50%', color: 'var(--google-red-text)', flexShrink: 0 }}>
            <AlertTriangle size={20} />
          </div>
        )}
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {message}
        </div>
      </div>
    </Modal>
  );
}
