import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { api } from './api';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { CommandPalette } from './components/CommandPalette';
import { AuthGate } from './components/AuthGate';

const AgenticWorkspace = lazy(() => import('./components/AgenticWorkspace').then(m => ({ default: m.AgenticWorkspace })));
const TasksView = lazy(() => import('./components/TasksView').then(m => ({ default: m.TasksView })));
const CallRoomView = lazy(() => import('./components/CallRoomView').then(m => ({ default: m.CallRoomView })));
const VotingView = lazy(() => import('./components/VotingView').then(m => ({ default: m.VotingView })));
const PeersView = lazy(() => import('./components/PeersView').then(m => ({ default: m.PeersView })));
const SettingsView = lazy(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));
const OraclePanel = lazy(() => import('./components/OraclePanel').then(m => ({ default: m.OraclePanel })));

function AppContent() {
  const { currentUser, isHost, loading, theme, toggleTheme, authNotice, clearAuthNotice } = useAuth();
  const toast = useToast();
  const [currentView, setCurrentView] = useState(() => localStorage.getItem('frontier_active_view') || 'command');
  const [isOracleOpen, setIsOracleOpen] = useState(false);
  const [isCmdOpen, setIsCmdOpen] = useState(false);
  const [taskCount, setTaskCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('frontier_sidebar_collapsed') === 'true';
  });

  const handleSelectView = (viewId) => {
    setCurrentView(viewId);
    localStorage.setItem('frontier_active_view', viewId);
    if (viewId === 'command') setIsOracleOpen(false);
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCmdOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const loadCount = async () => {
      try {
        const res = await api.getTasks();
        const active = (res?.tasks || []).filter(t => t.status !== 'COMPLETED').length;
        setTaskCount(active);
        if (isHost) {
          const pendRes = await api.getPendingMembers().catch(() => ({ pending: [] }));
          setPendingCount((pendRes?.pending || []).length);
        } else {
          setPendingCount(0);
        }
      } catch { }
    };
    loadCount();
    window.addEventListener('frontier:workspace-updated', loadCount);
    const pollId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        window.dispatchEvent(new CustomEvent('frontier:workspace-updated'));
      }
    }, 25000);
    return () => {
      window.removeEventListener('frontier:workspace-updated', loadCount);
      clearInterval(pollId);
    };
  }, [currentUser?.id, isHost]);

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

  if (loading) {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        Verifying Xenon session...
      </div>
    );
  }

  if (!currentUser) {
    return <AuthGate />;
  }

  return (
    <div className="app-container">
      <Header
        onToggleOracle={() => setIsOracleOpen(prev => !prev)}
        isOracleOpen={isOracleOpen}
        onToggleSidebar={toggleSidebar}
        isSidebarCollapsed={isSidebarCollapsed}
        onOpenCommandPalette={() => setIsCmdOpen(true)}
        currentView={currentView}
      />

      <div className="main-body">
        <Sidebar
          currentView={currentView}
          onChangeView={handleSelectView}
          taskCount={taskCount}
          pendingCount={pendingCount}
          isCollapsed={isSidebarCollapsed}
        />

        <main className="main-content-canvas">
          <Suspense fallback={<div style={{ padding: '32px', color: 'var(--text-muted)', fontSize: '0.88rem' }}>Loading workspace...</div>}>
            {currentView === 'command' && <AgenticWorkspace onOpenClassicView={handleSelectView} />}
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

      <MobileBottomNav
        currentView={currentView}
        onChangeView={handleSelectView}
        taskCount={taskCount}
        pendingCount={pendingCount}
      />

      <CommandPalette
        isOpen={isCmdOpen}
        onClose={() => setIsCmdOpen(false)}
        onNavigate={handleSelectView}
        onToggleTheme={toggleTheme}
        onToggleOracle={() => setIsOracleOpen(prev => !prev)}
        isHost={isHost}
        theme={theme}
      />
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
