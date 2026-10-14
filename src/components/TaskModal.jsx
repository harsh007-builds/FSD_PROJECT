import React, { useState, useEffect } from 'react';
import { X, CheckSquare, BookOpen, Flag } from 'lucide-react';
import { toDateKey, fromInputDateToIso } from '../utils/dateUtils';

const TaskModal = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  initialData, 
  initialDate, 
  initialType = 'Task',
  activeProject, 
  projects = [] 
}) => {
  const [formData, setFormData] = useState({
    task: '',
    description: '',
    type: 'Task',
    priority: 'Medium',
    status: 'Todo',
    assignee: '',
    dueDate: '',
    projectId: '',
    labels: ''
  });
  
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          task: initialData.task || initialData.title || '',
          description: initialData.description || '',
          type: initialData.type || 'Task',
          priority: initialData.priority || 'Medium',
          status: initialData.status || 'Todo',
          assignee: initialData.assignee?._id || initialData.assignee || '',
          dueDate: initialData.dueDate ? toDateKey(initialData.dueDate) : '',
          projectId: initialData.projectId || activeProject?.id || '',
          labels: (initialData.labels || []).join(', ')
        });
      } else {
        setFormData({
          task: '',
          description: '',
          type: initialType || 'Task',
          priority: 'Medium',
          status: 'Todo',
          assignee: '',
          dueDate: initialDate || '',
          projectId: activeProject?.id || '',
          labels: initialType === 'Study Session' ? 'study-session' : ''
        });
      }
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen, initialData, initialDate, initialType, activeProject]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.task.trim()) {
      setError('Title is required.');
      return;
    }

    const finalProjectId = initialData?.projectId || activeProject?.id || formData.projectId;

    if (!finalProjectId) {
      setError('Please select a project.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await onSubmit({
        ...formData,
        dueDate: formData.dueDate ? fromInputDateToIso(formData.dueDate) : null,
        labels: formData.labels ? formData.labels.split(',').map(l => l.trim()).filter(Boolean) : [],
        projectId: finalProjectId,
        id: initialData?.id
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error && name === 'task' && value.trim()) {
      setError(''); // Clear error when user types
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
        className="relative bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-blue-900/20 w-full max-w-md overflow-hidden transform transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-800/50">
          <h2 id="modal-title" className="text-xl font-semibold text-white">
            {initialData ? 'Edit Task' : 'Create New Task'}
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
          {/* Event Type Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Event Type
            </label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
              {[
                { id: 'Task', label: 'Task', icon: CheckSquare },
                { id: 'Study Session', label: 'Study Session', icon: BookOpen },
                { id: 'Milestone', label: 'Milestone', icon: Flag },
              ].map(t => {
                const Icon = t.icon;
                const isSelected = formData.type === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, type: t.id }))}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all ${
                      isSelected
                        ? t.id === 'Study Session'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                          : t.id === 'Milestone'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm'
                            : 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label htmlFor="task" className="block text-sm font-medium text-slate-300 mb-1.5">
              {formData.type === 'Study Session' ? 'Session Title' : formData.type === 'Milestone' ? 'Milestone Title' : 'Task Title'} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="task"
              name="task"
              value={formData.task}
              onChange={handleChange}
              disabled={isSubmitting}
              placeholder={
                formData.type === 'Study Session' 
                  ? "e.g., Algorithms & Data Structures Prep" 
                  : formData.type === 'Milestone' 
                    ? "e.g., Midterm Project Submission" 
                    : "e.g., Design Database Schema"
              }
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
              placeholder="Add more details to this task..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white placeholder:text-slate-600 disabled:opacity-50 focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
            />
          </div>

          {/* Project Selection (only if creating globally) */}
          {!activeProject && !initialData && (
            <div>
              <label htmlFor="projectId" className="block text-sm font-medium text-slate-300 mb-1.5">
                Project <span className="text-red-400">*</span>
              </label>
              <select
                id="projectId"
                name="projectId"
                value={formData.projectId}
                onChange={(e) => {
                  handleChange(e);
                  // Reset assignee when project changes
                  setFormData(prev => ({ ...prev, assignee: '' }));
                }}
                disabled={isSubmitting}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white disabled:opacity-50 focus:outline-none focus:border-blue-500/50 transition-colors appearance-none"
              >
                <option value="">Select a project...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Grid for two-column layout */}
          <div className="grid grid-cols-2 gap-4">
            {/* Priority */}
            <div>
              <label htmlFor="priority" className="block text-sm font-medium text-slate-300 mb-1.5">Priority</label>
              <select
                id="priority"
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                disabled={isSubmitting}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white disabled:opacity-50 focus:outline-none focus:border-blue-500/50 transition-colors appearance-none"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>

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
                <option value="Backlog">Backlog</option>
                <option value="Todo">Todo</option>
                <option value="In Progress">In Progress</option>
                <option value="Review">Review</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Assignee & Deadline Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="assignee" className="block text-sm font-medium text-slate-300 mb-1.5">Assignee</label>
              <select
                id="assignee"
                name="assignee"
                value={formData.assignee}
                onChange={handleChange}
                disabled={isSubmitting || (!activeProject && !formData.projectId)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white disabled:opacity-50 focus:outline-none focus:border-blue-500/50 transition-colors appearance-none"
              >
                <option value="">Unassigned</option>
                {(() => {
                  const targetProject = activeProject || projects.find(p => p.id === formData.projectId);
                  if (!targetProject) return null;
                  
                  return (
                    <>
                      {targetProject.owner && (
                        <option value={targetProject.owner._id || targetProject.owner}>
                          {targetProject.owner.name || 'Owner'}
                        </option>
                      )}
                      {targetProject.members?.filter(m => m._id !== (targetProject.owner?._id || targetProject.owner)).map(m => (
                        <option key={m._id || m} value={m._id || m}>
                          {m.name || 'Member'}
                        </option>
                      ))}
                    </>
                  );
                })()}
              </select>
            </div>
            
            <div>
              <label htmlFor="dueDate" className="block text-sm font-medium text-slate-300 mb-1.5">Due Date</label>
              <input
                type="date"
                id="dueDate"
                name="dueDate"
                value={formData.dueDate}
                onChange={handleChange}
                disabled={isSubmitting}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white disabled:opacity-50 focus:outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Labels */}
          <div>
            <label htmlFor="labels" className="block text-sm font-medium text-slate-300 mb-1.5">Labels</label>
            <input
              type="text"
              id="labels"
              name="labels"
              value={formData.labels}
              onChange={handleChange}
              disabled={isSubmitting}
              placeholder="e.g., frontend, bug, design"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white placeholder:text-slate-600 disabled:opacity-50 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
            <p className="text-xs text-slate-500 mt-1">Separate with commas</p>
          </div>

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
              ) : initialData ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskModal;
