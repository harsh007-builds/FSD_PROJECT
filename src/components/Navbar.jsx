import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BookOpen, Menu, X, LogOut, Bell, LayoutDashboard, KanbanSquare, Calendar } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { notificationService } from '../services/api';
import { useSocket } from '../context/SocketContext';

const Navbar = ({ onViewChange, activeTab, onTabChange, isLoggedIn }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout } = useUser();
  const socketContext = useSocket();
  const isConnected = socketContext?.isConnected;

  // Notification state
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const [notifs, countData] = await Promise.all([
        notificationService.getNotifications(),
        notificationService.getUnreadCount(),
      ]);
      setNotifications(notifs);
      setUnreadCount(countData.count);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
    // Poll every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error('Failed to mark notifications as read:', err);
    }
  };

  const handleNav = (view, e) => {
    e.preventDefault();
    if (onViewChange) onViewChange(view);
    setIsMobileMenuOpen(false);
  };

  const timeAgo = (date) => {
    const diff = (Date.now() - new Date(date).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
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
              {/* Notification Bell */}
              <div className="relative" ref={notifRef}>
                <button 
                  onClick={() => {
                    setShowNotifications(!showNotifications);
                    if (!showNotifications) fetchNotifications();
                  }}
                  className="relative p-2 text-slate-400 hover:text-white transition-colors bg-slate-900 rounded-full border border-slate-800"
                  title="Notifications"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notification Dropdown */}
                {showNotifications && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl shadow-black/30 overflow-hidden z-50">
                    <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">Notifications</h3>
                      {unreadCount > 0 && (
                        <button onClick={handleMarkAllRead} className="text-xs text-blue-400 hover:text-blue-300">
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-500">
                          No notifications yet
                        </div>
                      ) : (
                        notifications.slice(0, 15).map(n => (
                          <div 
                            key={n._id} 
                            className={`p-3 border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors ${!n.read ? 'bg-blue-500/5' : ''}`}
                          >
                            <p className="text-sm text-slate-300">{n.message}</p>
                            <span className="text-xs text-slate-500 mt-1 block">{timeAgo(n.createdAt)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

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
          isMobileMenuOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0 border-transparent'
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
    </nav>
  );
};

export default Navbar;
