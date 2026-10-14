import React, { useState } from 'react';
import { X, ShieldAlert, ArrowRightLeft, AlertCircle } from 'lucide-react';

const TransferOwnershipModal = ({
  isOpen,
  onClose,
  onTransfer,
  members = [],
  currentOwnerId,
  projectName = 'Project',
}) => {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  // Candidates: members excluding the current owner
  const candidates = members.filter(m => {
    const mId = m._id || m.id;
    return mId && mId.toString() !== currentOwnerId?.toString();
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError('Please select a member to transfer ownership to.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await onTransfer(selectedUserId);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to transfer ownership.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Transfer Ownership</h3>
              <p className="text-xs text-slate-400">{projectName}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="mx-5 mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Important:</strong> You are transferring primary ownership. The chosen teammate will gain full administrative authority, including the ability to delete or archive this project. You will retain an <strong>Admin</strong> role.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Select New Project Owner</label>
            {candidates.length === 0 ? (
              <p className="text-xs text-slate-500 p-3 bg-slate-950 rounded-xl border border-slate-800">
                No eligible teammates found. Invite teammates to the project first before transferring ownership.
              </p>
            ) : (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/50"
              >
                <option value="">-- Choose a teammate --</option>
                {candidates.map((m) => (
                  <option key={m._id || m.id} value={m._id || m.id}>
                    {m.name} ({m.email}) — Current Role: {m.role || 'Member'}
                  </option>
                ))}
              </select>
            )}
          </div>

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
              disabled={isSubmitting || candidates.length === 0}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Transferring...
                </>
              ) : (
                'Confirm Transfer'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TransferOwnershipModal;
