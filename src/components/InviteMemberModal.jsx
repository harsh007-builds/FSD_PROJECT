import React, { useState, useEffect, useRef } from 'react';
import { X, UserPlus, Search, Shield, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authService } from '../services/api';

const InviteMemberModal = ({ 
  isOpen, 
  onClose, 
  onInvite, 
  projectName, 
  currentUserRole = 'Member' 
}) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Member');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const searchTimeoutRef = useRef(null);

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setRole('Member');
      setSearchResults([]);
      setSelectedUser(null);
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Live user search with debounce
  useEffect(() => {
    if (!email || email.length < 2 || selectedUser) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await authService.searchUsers(email);
        setSearchResults(results || []);
      } catch (err) {
        console.error('Search users error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [email, selectedUser]);

  if (!isOpen) return null;

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setEmail(user.email);
    setSearchResults([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const targetEmail = (selectedUser ? selectedUser.email : email).trim();
    if (!targetEmail) {
      setError('Please provide a valid user email address');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await onInvite({ email: targetEmail, role });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to send invitation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isOwner = currentUserRole === 'Owner';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Invite Team Member</h3>
              <p className="text-xs text-slate-400">to {projectName}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice Banner */}
        <div className="mx-5 mt-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <span>
            <strong>Secure In-App Invitation:</strong> An invitation will be delivered directly to the user's StudySync account and notifications.
          </span>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* User Search & Email Input */}
          <div className="space-y-1.5 relative">
            <label className="text-xs font-semibold text-slate-300">User Email or Name</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSelectedUser(null);
                }}
                placeholder="search by name or enter email..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-3.5 h-3.5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Suggestions dropdown */}
            {searchResults.length > 0 && !selectedUser && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-slate-950 border border-slate-800 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-slate-800/60">
                {searchResults.map((u) => (
                  <div
                    key={u._id}
                    onClick={() => handleSelectUser(u)}
                    className="p-2.5 flex items-center justify-between hover:bg-slate-900 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                        {u.avatarInitials || u.name[0]}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">{u.name}</p>
                        <p className="text-[10px] text-slate-400">{u.email}</p>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">Select</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Role Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Project Role</label>
            <div className="grid grid-cols-2 gap-3">
              <label 
                className={`p-3 rounded-xl border flex flex-col gap-1 cursor-pointer transition-all ${
                  role === 'Member' 
                    ? 'bg-blue-500/10 border-blue-500/40 text-blue-300' 
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Member
                  </span>
                  <input 
                    type="radio" 
                    name="role" 
                    value="Member" 
                    checked={role === 'Member'} 
                    onChange={() => setRole('Member')}
                    className="hidden"
                  />
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">Can create and complete tasks, comment, and view workspace.</p>
              </label>

              <label 
                className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${
                  !isOwner 
                    ? 'opacity-40 cursor-not-allowed bg-slate-950 border-slate-800 text-slate-600'
                    : role === 'Admin' 
                      ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300 cursor-pointer' 
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 cursor-pointer'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" /> Admin
                  </span>
                  <input 
                    type="radio" 
                    name="role" 
                    value="Admin" 
                    disabled={!isOwner}
                    checked={role === 'Admin'} 
                    onChange={() => isOwner && setRole('Admin')}
                    className="hidden"
                  />
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  {isOwner ? 'Can invite members, manage tasks, and update project settings.' : 'Only the project Owner can assign Admin roles.'}
                </p>
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending Invitation...
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  Send Invitation
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InviteMemberModal;
