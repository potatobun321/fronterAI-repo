import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { api } from './api';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MobileBottomNav } from './components/MobileBottomNav';

const TasksView = lazy(() => import('./components/TasksView').then(m => ({ default: m.TasksView })));
const CallRoomView = lazy(() => import('./components/CallRoomView').then(m => ({ default: m.CallRoomView })));
const VotingView = lazy(() => import('./components/VotingView').then(m => ({ default: m.VotingView })));
const PeersView = lazy(() => import('./components/PeersView').then(m => ({ default: m.PeersView })));
const SettingsView = lazy(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));
const OraclePanel = lazy(() => import('./components/OraclePanel').then(m => ({ default: m.OraclePanel })));
const AgenticWorkspace = lazy(() => import('./components/AgenticWorkspace').then(m => ({ default: m.AgenticWorkspace })));

function AppContent() {
  const { currentUser, authNotice, clearAuthNotice } = useAuth();
  const toast = useToast();
  const [currentView, setCurrentView] = useState('tasks');
  const [uiMode, setUiMode] = useState(() => localStorage.getItem('frontier_ui_mode') || 'agentic');
  const [isOracleOpen, setIsOracleOpen] = useState(false);

  const handleChangeUiMode = (mode) => {
    setUiMode(mode);
    localStorage.setItem('frontier_ui_mode', mode);
  };

  const handleOpenClassicView = (viewId) => {
    setCurrentView(viewId);
    handleChangeUiMode('classic');
  };
  const [taskCount, setTaskCount] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('frontier_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    const loadCount = async () => {
      try {
        const res = await api.getTasks();
        const active = (res?.tasks || []).filter(t => t.status !== 'COMPLETED').length;
        setTaskCount(active);
      } catch { }
    };
    loadCount();
    window.addEventListener('frontier:workspace-updated', loadCount);
    return () => window.removeEventListener('frontier:workspace-updated', loadCount);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!authNotice) return;
    if (authNotice.type === 'error') toast.error(authNotice.message);
    else if (authNotice.type === 'success') toast.success(authNotice.message);
    else toast.info(authNotice.message);
    clearAuthNotice();
  }, [authNotice, clearAuthNotice, toast]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('frontier_sidebar_collapsed', String(next));
      return next;
    });
  };

  return (
    <div className="app-container">
      <Header
        onToggleOracle={() => setIsOracleOpen(prev => !prev)}
        isOracleOpen={isOracleOpen}
        onToggleSidebar={toggleSidebar}
        isSidebarCollapsed={isSidebarCollapsed}
        uiMode={uiMode}
        onChangeUiMode={handleChangeUiMode}
      />

      {uiMode === 'agentic' ? (
        <div className="main-body">
          <Suspense fallback={<div style={{ padding: '40px', color: 'var(--text-muted)' }}>Loading Agentic Workspace...</div>}>
            <AgenticWorkspace onOpenClassicView={handleOpenClassicView} />
          </Suspense>
        </div>
      ) : (
        <div className="main-body">
          <Sidebar
            currentView={currentView}
            onChangeView={setCurrentView}
            taskCount={taskCount}
            isCollapsed={isSidebarCollapsed}
          />

          <main className="main-content-canvas" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <Suspense fallback={<div style={{ padding: '40px', color: 'var(--text-muted)' }}>Loading workspace...</div>}>
              {currentView === 'tasks' && <TasksView />}
              {currentView === 'callroom' && <CallRoomView />}
              {currentView === 'voting' && <VotingView />}
              {currentView === 'peers' && <PeersView />}
              {currentView === 'settings' && <SettingsView />}
            </Suspense>
          </main>

          <Suspense fallback={null}>
            <OraclePanel
              isOpen={isOracleOpen}
              onClose={() => setIsOracleOpen(false)}
            />
          </Suspense>
        </div>
      )}

      {uiMode === 'classic' && (
        <MobileBottomNav
          currentView={currentView}
          onChangeView={setCurrentView}
          taskCount={taskCount}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
