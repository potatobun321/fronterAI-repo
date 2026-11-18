import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { TasksView } from './components/TasksView';
import { CallRoomView } from './components/CallRoomView';
import { VotingView } from './components/VotingView';
import { PeersView } from './components/PeersView';
import { SettingsView } from './components/SettingsView';
import { OraclePanel } from './components/OraclePanel';

function AppContent() {
  const [currentView, setCurrentView] = useState('tasks');
  const [isOracleOpen, setIsOracleOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('frontier_sidebar_collapsed') === 'true';
  });

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
      />

      <div className="main-body">
        <Sidebar
          currentView={currentView}
          onChangeView={setCurrentView}
          isCollapsed={isSidebarCollapsed}
        />

        <main className="main-content-canvas" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {currentView === 'tasks' && <TasksView />}
          {currentView === 'callroom' && <CallRoomView />}
          {currentView === 'voting' && <VotingView />}
          {currentView === 'peers' && <PeersView />}
          {currentView === 'settings' && <SettingsView />}
        </main>

        <OraclePanel
          isOpen={isOracleOpen}
          onClose={() => setIsOracleOpen(false)}
        />
      </div>

      <MobileBottomNav
        currentView={currentView}
        onChangeView={setCurrentView}
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
