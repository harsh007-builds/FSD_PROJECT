import React, { useState, useEffect, useCallback } from 'react';
import { 
  BookOpen, Menu, X, LogOut, Bell, Mail, 
  LayoutDashboard, KanbanSquare, Calendar, Search, CheckSquare 
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { notificationService, invitationService } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useRouter } from '../context/RouterContext';
import UserInvitationsModal from './UserInvitationsModal';
import NotificationCenterModal from './NotificationCenterModal';
import GlobalSearchModal from './GlobalSearchModal';

const Navbar = ({ onViewChange, activeTab, onTabChange, isLoggedIn }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout } = useUser();
  const socketContext = useSocket();
  const isConnected = socketContext?.isConnected;

  // Global search modal state
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Notification state
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);

  // Invitations state
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const [showInvitationsModal, setShowInvitationsModal] = useState(false);

  // Router navigation
  const { navigate, navigateToProject } = useRouter();

  // Global keyboard shortcut listener (Ctrl+K, Cmd+K, '/')
  useEffect(() => {
    if (!user) return;
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchModalOpen(prev => !prev);
        return;
      }
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        setIsSearchModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user]);

  const fetchNotificationsAndInvites = useCallback(async () => {
    if (!user) return;
    try {
      const [notifs, countData, invites] = await Promise.all([
        notificationService.getNotifications().catch(() => []),
        notificationService.getUnreadCount().catch(() => ({ count: 0 })),
        invitationService.getMyInvitations().catch(() => []),
      ]);
      setNotifications(notifs);
      setUnreadCount(countData.count);
      setPendingInviteCount((invites || []).length);
    } catch (err) {
      console.error('Failed to fetch notifications/invites:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchNotificationsAndInvites();
    // Poll every 30 seconds as fallback
    const interval = setInterval(fetchNotificationsAndInvites, 30000);
    return () => clearInterval(interval);
  }, [fetchNotificationsAndInvites]);

  // Real-time socket notifications
  const socket = socketContext?.socket;
  useEffect(() => {
    if (!socket) return;
    const handleNewNotif = (newNotif) => {
      setNotifications(prev => [newNotif, ...prev]);
      setUnreadCount(prev => prev + 1);
    };
    socket.on('notification:new', handleNewNotif);
    return () => socket.off('notification:new', handleNewNotif);
  }, [socket]);

  const handleNav = (view, e) => {
    e.preventDefault();
    if (onViewChange) onViewChange(view);
    setIsMobileMenuOpen(false);
  };

  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'tasks', label: 'My Tasks', icon: CheckSquare },
    { key: 'board', label: 'Board', icon: KanbanSquare },
    { key: 'calendar', label: 'Calendar', icon: Calendar },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <div 
          className="flex items-center gap-3 cursor-pointer shrink-0"
          onClick={(e) => handleNav('landing', e)}
        >
          <div className="p-1.5 bg-blue-500 rounded-lg">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            StudySync
          </span>
        </div>
        
        {/* Tabs (only when logged in) */}
        {isLoggedIn && user && (
          <div className="hidden md:flex items-center gap-1 bg-slate-900/50 border border-slate-800 rounded-lg p-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.key 
                    ? 'bg-blue-500/10 text-blue-400' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Desktop Links (when not logged in) */}
        {!isLoggedIn && !user && (
          <div className="hidden md:flex items-center gap-8 text-slate-400 font-medium">
            <a href="#" onClick={(e) => handleNav('landing', e)} className="hover:text-white transition-colors">Features</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        )}

        {/* Right side */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="hidden md:flex items-center gap-3">
              {/* Search Trigger Button */}
              <button
                onClick={() => setIsSearchModalOpen(true)}
                className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-400 bg-slate-900 hover:bg-slate-850 hover:text-slate-200 rounded-full border border-slate-800 transition-colors shadow-sm"
                title="Global Search (Ctrl + K)"
              >
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden lg:inline text-slate-400">Search...</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-400">
                  ⌘K
                </kbd>
              </button>

              {/* Invitations Button */}
              <button 
                onClick={() => setShowInvitationsModal(true)}
                className="relative p-2 text-slate-400 hover:text-white transition-colors bg-slate-900 rounded-full border border-slate-800"
                title="Project Invitations"
              >
                <Mail className="w-5 h-5" />
                {pendingInviteCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {pendingInviteCount > 9 ? '9+' : pendingInviteCount}
                  </span>
                )}
              </button>

              {/* Notification Bell */}
              <button 
                onClick={() => setShowNotificationCenter(true)}
                className="relative p-2 text-slate-400 hover:text-white transition-colors bg-slate-900 rounded-full border border-slate-800"
                title="Open Notification Center"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Connection Status */}
              {socketContext !== undefined && (
                <div 
                  className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-full" 
                  title={isConnected ? "Real-time sync active" : "Disconnected from real-time sync"}
                >
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' : 'bg-red-500'}`}></div>
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider hidden lg:block">
                    {isConnected ? 'Live' : 'Offline'}
                  </span>
                </div>
              )}

              {/* User info */}
              <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-full pl-1.5 pr-4 py-1.5">
                <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                  {user.avatarInitials}
                </div>
                <span className="text-slate-300 font-medium text-sm">{user.name.split(' ')[0]}</span>
              </div>
              <button 
                onClick={logout}
                className="p-2 text-slate-400 hover:text-red-400 transition-colors bg-slate-900 rounded-full border border-slate-800"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-3">
              <button 
                onClick={(e) => handleNav('login', e)} 
                className="px-4 py-2 text-slate-300 hover:text-white font-medium transition-colors"
              >
                Sign In
              </button>
              <button 
                onClick={(e) => handleNav('register', e)} 
                className="btn-primary"
              >
                Get Started
              </button>
            </div>
          )}

          {/* Search trigger on mobile */}
          {user && (
            <button
              onClick={() => setIsSearchModalOpen(true)}
              className="md:hidden p-2 text-slate-400 hover:text-white transition-colors"
              title="Search workspace"
            >
              <Search className="w-5 h-5" />
            </button>
          )}

          <button 
            className="md:hidden p-2 text-slate-400 hover:text-white transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <div 
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out bg-slate-900 border-b border-slate-800 ${
          isMobileMenuOpen ? 'max-h-[450px] opacity-100' : 'max-h-0 opacity-0 border-transparent'
        }`}
      >
        <div className="px-6 py-4 flex flex-col gap-3">
          {user ? (
            <>
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { onTabChange(tab.key); setIsMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 text-left py-2 text-sm font-medium ${
                    activeTab === tab.key ? 'text-blue-400' : 'text-slate-400'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
              <button
                onClick={() => { setShowNotificationCenter(true); setIsMobileMenuOpen(false); }}
                className="flex items-center justify-between text-left py-2 text-sm font-medium text-slate-400 hover:text-white"
              >
                <span className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-blue-400" /> Notifications
                </span>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setShowInvitationsModal(true); setIsMobileMenuOpen(false); }}
                className="flex items-center justify-between text-left py-2 text-sm font-medium text-slate-400 hover:text-white"
              >
                <span className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-blue-400" /> Invitations
                </span>
                {pendingInviteCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold">
                    {pendingInviteCount}
                  </span>
                )}
              </button>
              <button 
                onClick={() => { logout(); setIsMobileMenuOpen(false); }}
                className="text-red-400 hover:text-red-300 transition-colors font-medium text-sm text-left mt-2"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <a href="#" onClick={(e) => handleNav('landing', e)} className="text-slate-400 hover:text-white transition-colors font-medium text-lg">Features</a>
              <button 
                onClick={(e) => handleNav('login', e)} 
                className="text-slate-300 hover:text-white font-medium text-lg text-left mt-2"
              >
                Sign In
              </button>
              <button 
                onClick={(e) => handleNav('register', e)} 
                className="btn-primary w-full mt-4"
              >
                Get Started
              </button>
            </>
          )}
        </div>
      </div>

      {/* Global Search Palette Modal */}
      <GlobalSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onNavigateToProject={(projId) => {
          if (navigateToProject) {
            navigateToProject(projId);
          } else if (navigate) {
            navigate(`/projects/${projId}`);
          } else if (onTabChange) {
            onTabChange('board');
          }
        }}
      />

      {/* Notification Center Modal */}
      <NotificationCenterModal
        isOpen={showNotificationCenter}
        onClose={() => setShowNotificationCenter(false)}
        onNavigateToProject={(projId) => {
          if (navigateToProject) {
            navigateToProject(projId);
          } else if (navigate) {
            navigate(`/projects/${projId}`);
          } else if (onTabChange) {
            onTabChange('board');
          }
        }}
        onOpenInvitations={() => setShowInvitationsModal(true)}
        onNotificationsUpdated={(updatedNotifs, count) => {
          setNotifications(updatedNotifs);
          setUnreadCount(count);
        }}
      />

      {/* User Invitations Modal */}
      <UserInvitationsModal
        isOpen={showInvitationsModal}
        onClose={() => setShowInvitationsModal(false)}
        onInvitationAccepted={() => {
          fetchNotificationsAndInvites();
          if (onTabChange) onTabChange('board');
        }}
      />
    </nav>
  );
};

export default Navbar;
