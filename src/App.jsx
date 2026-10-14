import React, { useState, useEffect } from 'react';
import MainLayout from './layouts/MainLayout';
import Hero from './sections/Hero';
import Features from './sections/Features';
import DashboardPreview from './sections/DashboardPreview';
import DashboardHome from './sections/DashboardHome';
import CalendarView from './sections/CalendarView';
import MyTasksView from './sections/MyTasksView';
import Login from './sections/Login';
import Register from './sections/Register';
import { UserProvider, useUser } from './context/UserContext';
import { ProjectProvider } from './context/ProjectContext';
import { SocketProvider } from './context/SocketContext';
import { RouterProvider, useRouter } from './context/RouterContext';
import { ToastProvider } from './context/ToastContext';
import RealtimeManager from './components/RealtimeManager';

function AppContent() {
  const { user, loading } = useUser();
  const { path, projectId, navigate } = useRouter();
  const [view, setView] = useState('landing'); // 'landing', 'login', 'register'
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'tasks', 'board', 'calendar'

  // Sync route with view / activeTab
  useEffect(() => {
    if (!user) {
      if (path.includes('login')) setView('login');
      else if (path.includes('register')) setView('register');
      else setView('landing');
    } else {
      if (projectId || path.startsWith('/projects') || path.startsWith('/board')) {
        setActiveTab('board');
      } else if (path.startsWith('/calendar')) {
        setActiveTab('calendar');
      } else if (path.startsWith('/tasks')) {
        setActiveTab('tasks');
      } else if (path.startsWith('/dashboard')) {
        setActiveTab('dashboard');
      }
    }
  }, [path, projectId, user]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'dashboard') navigate('/dashboard');
    else if (tab === 'tasks') navigate('/tasks');
    else if (tab === 'board') navigate('/board');
    else if (tab === 'calendar') navigate('/calendar');
  };

  const handleViewChange = (newView) => {
    setView(newView);
    if (newView === 'login') navigate('/login');
    else if (newView === 'register') navigate('/register');
    else navigate('/');
  };

  if (loading) {
    return (
      <MainLayout onViewChange={handleViewChange}>
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
          <MainLayout 
            onViewChange={handleViewChange} 
            activeTab={activeTab} 
            onTabChange={handleTabChange} 
            isLoggedIn
          >
            {activeTab === 'dashboard' && <DashboardHome />}
            {activeTab === 'tasks' && <MyTasksView />}
            {activeTab === 'board' && <DashboardPreview />}
            {activeTab === 'calendar' && <CalendarView />}
          </MainLayout>
        </ProjectProvider>
      </SocketProvider>
    );
  }

  // If not logged in, show requested view
  return (
    <MainLayout onViewChange={handleViewChange}>
      {view === 'login' && <Login onNavigate={handleViewChange} />}
      {view === 'register' && <Register onNavigate={handleViewChange} />}
      {view === 'landing' && (
        <>
          <Hero onNavigate={handleViewChange} />
          <Features />
        </>
      )}
    </MainLayout>
  );
}

function App() {
  return (
    <RouterProvider>
      <ToastProvider>
        <UserProvider>
          <AppContent />
        </UserProvider>
      </ToastProvider>
    </RouterProvider>
  );
}

export default App;
