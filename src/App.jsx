import React, { useState } from 'react';
import MainLayout from './layouts/MainLayout';
import Hero from './sections/Hero';
import Features from './sections/Features';
import DashboardPreview from './sections/DashboardPreview';
import DashboardHome from './sections/DashboardHome';
import CalendarView from './sections/CalendarView';
import Login from './sections/Login';
import Register from './sections/Register';
import { UserProvider, useUser } from './context/UserContext';
import { ProjectProvider } from './context/ProjectContext';
import { SocketProvider } from './context/SocketContext';
import RealtimeManager from './components/RealtimeManager';

function AppContent() {
  const { user, loading } = useUser();
  const [view, setView] = useState('landing'); // 'landing', 'login', 'register'
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'board', 'calendar'

  if (loading) {
    return (
      <MainLayout onViewChange={setView}>
        <div className="flex-1 flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </MainLayout>
    );
  }

  // If logged in, show app
  if (user) {
    return (
      <SocketProvider>
        <ProjectProvider>
          <RealtimeManager />
          <MainLayout onViewChange={setView} activeTab={activeTab} onTabChange={setActiveTab} isLoggedIn>
            {activeTab === 'dashboard' && <DashboardHome />}
            {activeTab === 'board' && <DashboardPreview />}
            {activeTab === 'calendar' && <CalendarView />}
          </MainLayout>
        </ProjectProvider>
      </SocketProvider>
    );
  }

  // If not logged in, show requested view
  return (
    <MainLayout onViewChange={setView}>
      {view === 'login' && <Login onNavigate={setView} />}
      {view === 'register' && <Register onNavigate={setView} />}
      {view === 'landing' && (
        <>
          <Hero onNavigate={setView} />
          <Features />
        </>
      )}
    </MainLayout>
  );
}

function App() {
  return (
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
}

export default App;
