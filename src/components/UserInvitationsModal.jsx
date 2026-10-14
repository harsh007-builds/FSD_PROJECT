import React, { useState, useEffect, useCallback } from 'react';
import { X, Mail, Check, AlertCircle, Clock, Shield, User, FolderKanban } from 'lucide-react';
import { invitationService } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useRouter } from '../context/RouterContext';

const UserInvitationsModal = ({ isOpen, onClose, onInvitationAccepted }) => {
  const [invitations, setInvitations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const toast = useToast();
  const { navigateToProject } = useRouter();

  const fetchInvitations = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await invitationService.getMyInvitations();
      setInvitations(data || []);
    } catch (err) {
      console.error('Failed to load user invitations:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchInvitations();
    }
  }, [isOpen, fetchInvitations]);

  if (!isOpen) return null;

  const handleAccept = async (invite) => {
    setProcessingId(invite._id);
    try {
      const res = await invitationService.acceptInvitation(invite._id);
      toast.success(`You joined "${invite.project?.name || 'Project'}"!`);
      setInvitations(prev => prev.filter(i => i._id !== invite._id));
      if (onInvitationAccepted) onInvitationAccepted(res.projectId || invite.project?._id);
      if (res.projectId || invite.project?._id) {
        onClose();
        navigateToProject(res.projectId || invite.project?._id);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to accept invitation');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (invite) => {
    setProcessingId(invite._id);
    try {
      await invitationService.declineInvitation(invite._id);
      toast.info(`Declined invitation for "${invite.project?.name || 'Project'}"`);
      setInvitations(prev => prev.filter(i => i._id !== invite._id));
    } catch (err) {
      toast.error(err.message || 'Failed to decline invitation');
    } finally {
      setProcessingId(null);
    }
  };

  const timeRemaining = (expiresAt) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `Expires in ${days}d ${hours}h`;
    return `Expires in ${hours}h`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Project Invitations</h3>
              <p className="text-xs text-slate-400">Teammate requests to collaborate</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content List */}
        <div className="p-5 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-3" />
              <p className="text-xs text-slate-400">Loading invitations...</p>
            </div>
          ) : invitations.length === 0 ? (
            <div className="text-center py-12 flex flex-col items-center">
              <FolderKanban className="w-12 h-12 text-slate-700 mb-3" />
              <h4 className="text-sm font-semibold text-slate-300">No Pending Invitations</h4>
              <p className="text-xs text-slate-500 max-w-xs mt-1">
                When project owners or admins invite you to join their workspaces, they'll appear here for review.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {invitations.map((invite) => {
                const isProcessing = processingId === invite._id;
                const isExpired = new Date(invite.expiresAt) < new Date();

                return (
                  <div 
                    key={invite._id}
                    className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-bold text-white truncate">
                            {invite.project?.name || 'Untitled Project'}
                          </h4>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            invite.role === 'Admin'
                              ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}>
                            {invite.role === 'Admin' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                            {invite.role}
                          </span>
                        </div>
                        {invite.project?.description && (
                          <p className="text-xs text-slate-400 line-clamp-2 mb-2">
                            {invite.project.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <span>
                            From: <strong className="text-slate-300">{invite.sender?.name || 'Teammate'}</strong>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {timeRemaining(invite.expiresAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-slate-800/60">
                      {isExpired ? (
                        <span className="text-xs text-red-400 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> This invitation has expired
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleDecline(invite)}
                            disabled={isProcessing}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                          >
                            Decline
                          </button>
                          <button
                            onClick={() => handleAccept(invite)}
                            disabled={isProcessing}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-1.5 shadow-md shadow-blue-600/20 disabled:opacity-50"
                          >
                            {isProcessing ? (
                              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Accept & Join
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserInvitationsModal;
