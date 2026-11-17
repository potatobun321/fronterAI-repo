import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, message) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, type, message }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = {
    success: (msg) => addToast('success', msg),
    error: (msg) => addToast('error', msg),
    info: (msg) => addToast('info', msg)
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map(t => {
          let Icon = Info;
          let iconColor = 'var(--google-blue)';
          if (t.type === 'success') {
            Icon = CheckCircle2;
            iconColor = 'var(--google-green)';
          } else if (t.type === 'error') {
            Icon = AlertCircle;
            iconColor = 'var(--google-red)';
          }

          return (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <Icon size={16} style={{ color: iconColor, flexShrink: 0 }} />
              <div className="toast-message">{t.message}</div>
              <button
                className="toast-close"
                onClick={() => removeToast(t.id)}
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
