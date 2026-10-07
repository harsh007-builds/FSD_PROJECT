import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const ProjectModal = ({ isOpen, onClose, onSubmit, onAddMember, initialData }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'Active',
    startDate: '',
    deadline: '',
    progress: 0,
  });
  
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [memberError, setMemberError] = useState('');

  // Format Date for `<input type="date">` which expects "YYYY-MM-DD"
  const formatDate = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toISOString().split('T')[0];
  };

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          name: initialData.name || '',
          description: initialData.description || '',
          status: initialData.status || 'Active',
          startDate: formatDate(initialData.startDate),
          deadline: formatDate(initialData.deadline),
          progress: initialData.progress || 0,
        });
      } else {
        setFormData({
          name: '',
          description: '',
          status: 'Active',
          startDate: '',
          deadline: '',
          progress: 0,
        });
      }
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Project name is required.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await onSubmit({
        ...formData,
        id: initialData?.id
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save project. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error && name === 'name' && value.trim()) {
      setError('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" 
        onClick={() => !isSubmitting && onClose()}
        aria-hidden="true"
      />
      
      {/* Modal Content */}
      <div 
        className="relative bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-blue-900/20 w-full max-w-lg overflow-hidden transform transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-800/50">
          <h2 id="modal-title" className="text-xl font-semibold text-white">
            {initialData ? 'Edit Project' : 'Create New Project'}
          </h2>
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed p-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1.5">
              Project Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              disabled={isSubmitting}
              placeholder="e.g., Q4 Marketing Campaign"
              className={`w-full bg-slate-950 border ${error ? 'border-red-500/50' : 'border-slate-800'} rounded-lg px-4 py-2.5 text-white placeholder:text-slate-600 disabled:opacity-50 focus:outline-none focus:border-blue-500/50 transition-colors`}
              autoFocus
            />
            {error && <p className="mt-1.5 text-sm text-red-400">{error}</p>}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-slate-300 mb-1.5">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              disabled={isSubmitting}
              placeholder="What is this project about?"
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white placeholder:text-slate-600 disabled:opacity-50 focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
            />
          </div>

          {/* Grid for two-column layout */}
          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                disabled={isSubmitting}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white disabled:opacity-50 focus:outline-none focus:border-blue-500/50 transition-colors appearance-none"
              >
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            {/* Progress */}
            <div>
              <label htmlFor="progress" className="block text-sm font-medium text-slate-300 mb-1.5">Progress (%)</label>
              <input
                type="number"
                id="progress"
                name="progress"
                value={formData.progress}
                onChange={handleChange}
                disabled={isSubmitting}
                min="0"
                max="100"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white disabled:opacity-50 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>
          </div>

          {/* Dates Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-slate-300 mb-1.5">Start Date</label>
              <input
                type="date"
                id="startDate"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                disabled={isSubmitting}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white disabled:opacity-50 focus:outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]"
              />
            </div>
            
            <div>
              <label htmlFor="deadline" className="block text-sm font-medium text-slate-300 mb-1.5">Deadline</label>
              <input
                type="date"
                id="deadline"
                name="deadline"
                value={formData.deadline}
                onChange={handleChange}
                disabled={isSubmitting}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white disabled:opacity-50 focus:outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]"
              />
            </div>
          </div>

          {initialData && onAddMember && (
            <div className="pt-4 border-t border-slate-800/50">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Project Members</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {initialData.owner && (
                  <div className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-1 rounded text-xs text-slate-300 border border-slate-700/50">
                    <div className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-[8px]">
                      {initialData.owner.avatarInitials || '?'}
                    </div>
                    {initialData.owner.name?.split(' ')[0]} (Owner)
                  </div>
                )}
                {initialData.members?.filter(m => m._id !== initialData.owner?._id).map(m => (
                  <div key={m._id} className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-1 rounded text-xs text-slate-300 border border-slate-700/50">
                    <div className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-[8px]">
                      {m.avatarInitials || '?'}
                    </div>
                    {m.name?.split(' ')[0]}
                  </div>
                ))}
              </div>
              
              <div className="flex gap-2">
                <input 
                  type="email" 
                  value={newMemberEmail}
                  onChange={e => { setNewMemberEmail(e.target.value); setMemberError(''); }}
                  placeholder="Invite by email..." 
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (!newMemberEmail) return;
                      try {
                        await onAddMember(initialData.id, newMemberEmail);
                        setNewMemberEmail('');
                      } catch (err) {
                        setMemberError(err.message || 'Failed to add member');
                      }
                    }
                  }}
                />
                <button 
                  type="button"
                  onClick={async () => {
                    if (!newMemberEmail) return;
                    try {
                      await onAddMember(initialData.id, newMemberEmail);
                      setNewMemberEmail('');
                    } catch (err) {
                      setMemberError(err.message || 'Failed to add member');
                    }
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Invite
                </button>
              </div>
              {memberError && <p className="text-xs text-red-400 mt-1.5">{memberError}</p>}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 mt-6 border-t border-slate-800/50 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-75 disabled:cursor-wait transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shadow-lg shadow-blue-500/25 flex items-center justify-center min-w-[120px]"
            >
              {isSubmitting ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              ) : initialData ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjectModal;
