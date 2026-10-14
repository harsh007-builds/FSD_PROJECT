import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Trash2, CheckCircle2, Circle, Search, 
  AlertCircle, Inbox, ListTodo, Calendar as CalendarIcon, 
  Settings, Menu, X, Archive, FolderKanban, Clock
} from 'lucide-react';
import { useProjects } from '../hooks/useProjects';
import { useUser } from '../context/UserContext';
import { useRouter } from '../context/RouterContext';
import { useToast } from '../context/ToastContext';
import TaskModal from '../components/TaskModal';
import ProjectModal from '../components/ProjectModal';
import ProjectWorkspace from './ProjectWorkspace';
import ConfirmModal from '../components/ConfirmModal';

const DashboardPreview = () => {
  const { user } = useUser();
  const { projectId: urlProjectId, tab: urlTab, navigateToProject, navigate } = useRouter();
  const toast = useToast();

  const { 
    activeProjectId, projects, tasks, isLoading, error, refreshProjects, 
    addTask, updateTask, deleteTask, setTaskStatus, setActiveProject, 
    addProject, updateProject, archiveProject, deleteProject, addMember, 
    removeMember, leaveProject, addComment, deleteComment,
    updateMemberRole, transferOwnership, inviteMember, cancelInvitation
  } = useProjects();
  
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);

  // Mobile sidebar drawer
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Delete task confirm modal
  const [taskToDeleteId, setTaskToDeleteId] = useState(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);

  // Filter projects (Active vs Archived)
  const [projectFilterMode, setProjectFilterMode] = useState('active'); // 'active' | 'archived'

  // Global Task Filters & Search & Sort
  const [globalFilter, setGlobalFilter] = useState(null); // 'My Tasks', 'High Priority', 'Due Today', 'Overdue', 'Completed'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('dueDate'); // 'dueDate', 'priority'

  // Sync route URL with active project
  useEffect(() => {
    if (urlProjectId && urlProjectId !== activeProjectId) {
      const exists = projects.some(p => p.id === urlProjectId);
      if (exists) {
        setActiveProject(urlProjectId);
        setGlobalFilter(null);
      }
    }
  }, [urlProjectId, activeProjectId, projects, setActiveProject]);

  const activeProject = useMemo(() => {
    return projects.find(p => p.id === activeProjectId) || null;
  }, [projects, activeProjectId]);

  // Filter projects by active vs archived
  const displayProjects = useMemo(() => {
    return projects.filter(p => {
      if (projectFilterMode === 'archived') return p.status === 'Archived';
      return p.status !== 'Archived';
    });
  }, [projects, projectFilterMode]);

  // Derive visible tasks for global list views
  let visibleTasks = [];
  if (activeProjectId) {
    visibleTasks = tasks.filter(t => t.projectId === activeProjectId);
  } else if (globalFilter) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    visibleTasks = tasks.filter(t => {
      if (globalFilter === 'My Tasks') {
        const uId = user?._id || user?.id;
        const aId = t.assignee?._id || t.assignee?.id || t.assignee;
        return aId && aId.toString() === uId?.toString();
      }
      if (globalFilter === 'High Priority') {
        return t.priority === 'High' || t.priority === 'Urgent';
      }
      if (globalFilter === 'Due Today') {
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate);
        due.setHours(0, 0, 0, 0);
        return due.getTime() === today.getTime();
      }
      if (globalFilter === 'Overdue') {
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate);
        due.setHours(0, 0, 0, 0);
        return due.getTime() < today.getTime() && t.status !== 'Completed';
      }
      if (globalFilter === 'Completed') {
        return t.status === 'Completed';
      }
      return true;
    });
  } else {
    visibleTasks = tasks;
  }

  // Search filter
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    visibleTasks = visibleTasks.filter(t => 
      (t.task && t.task.toLowerCase().includes(q)) || 
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.description && t.description.toLowerCase().includes(q))
    );
  }

  // Sort
  visibleTasks.sort((a, b) => {
    if (sortBy === 'priority') {
      const p = { 'Urgent': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
      return (p[b.priority] || 0) - (p[a.priority] || 0);
    } else {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
  });

  const handleSelectFilter = (filter) => {
    setGlobalFilter(filter);
    setActiveProject(null);
    navigate('/board');
    setIsMobileSidebarOpen(false);
  };

  const handleSelectProject = (projectId) => {
    setActiveProject(projectId);
    setGlobalFilter(null);
    navigateToProject(projectId);
    setIsMobileSidebarOpen(false);
  };

  const handleCloseWorkspace = () => {
    setActiveProject(null);
    navigate('/board');
  };

  const handleDeleteTaskConfirm = async () => {
    if (!taskToDeleteId) return;
    setIsDeletingTask(true);
    try {
      await deleteTask(taskToDeleteId);
      toast.success('Task removed');
      setTaskToDeleteId(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete task');
    } finally {
      setIsDeletingTask(false);
    }
  };

  return (
    <section className="h-[calc(100vh-64px)] overflow-hidden bg-slate-950 flex relative">
      
      {/* Mobile Drawer Backdrop */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar (Desktop & Mobile Drawer) */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-800 bg-slate-950 flex flex-col h-full overflow-y-auto transition-transform duration-300 md:static md:translate-x-0 shrink-0
        ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Mobile close button */}
        <div className="p-3 flex items-center justify-between md:hidden border-b border-slate-800">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Navigation</span>
          <button 
            onClick={() => setIsMobileSidebarOpen(false)}
            className="p-1 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Task Button */}
        <div className="p-4 border-b border-slate-800/60">
          <button 
            onClick={() => { setEditingTask(null); setIsTaskModalOpen(true); }}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>

        {/* Global Views */}
        <div className="p-3 space-y-1">
          <p className="px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Views</p>
          {[
            { label: 'My Tasks', icon: Inbox },
            { label: 'High Priority', icon: AlertCircle },
            { label: 'Due Today', icon: CalendarIcon },
            { label: 'Overdue', icon: Clock },
            { label: 'Completed', icon: CheckCircle2 }
          ].map(f => (
            <button
              key={f.label}
              onClick={() => handleSelectFilter(f.label)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                globalFilter === f.label && !activeProjectId 
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <f.icon className="w-4 h-4" /> {f.label}
            </button>
          ))}
        </div>

        {/* Projects Section */}
        <div className="p-3 flex-1 flex flex-col">
          <div className="flex items-center justify-between px-3 mb-2 mt-4">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Projects</p>
              <span className="text-[10px] px-1.5 py-0.2 bg-slate-900 border border-slate-800 rounded-full text-slate-400">
                {displayProjects.length}
              </span>
            </div>
            
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setProjectFilterMode(prev => prev === 'active' ? 'archived' : 'active')}
                className={`p-1 rounded transition-colors text-xs ${
                  projectFilterMode === 'archived' ? 'text-blue-400 bg-blue-500/10' : 'text-slate-500 hover:text-slate-300'
                }`}
                title={projectFilterMode === 'archived' ? "Viewing Archived Projects" : "View Active Projects"}
              >
                <Archive className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => { setEditingProject(null); setIsProjectModalOpen(true); }}
                className="text-slate-400 hover:text-blue-400 p-1 rounded hover:bg-slate-900 transition-colors"
                title="Create Project"
                aria-label="Add project"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          
          <div className="space-y-1 flex-1 overflow-y-auto">
            {displayProjects.length === 0 ? (
              <div className="p-4 text-center border border-dashed border-slate-800/80 rounded-xl my-2">
                <FolderKanban className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                <p className="text-[11px] text-slate-500">
                  {projectFilterMode === 'archived' ? 'No archived projects' : 'No active projects'}
                </p>
              </div>
            ) : (
              displayProjects.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectProject(p.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                    activeProjectId === p.id 
                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      p.status === 'Archived' ? 'bg-slate-600' :
                      p.status === 'Completed' ? 'bg-green-500' : 
                      p.status === 'On Hold' ? 'bg-yellow-500' : 
                      'bg-blue-500'
                    }`} />
                    <span className="truncate">{p.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-normal shrink-0 ml-1">
                    {p.progress || 0}%
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0A0F1C]">
        
        {/* Global Toolbar Header (only visible when not inside dedicated workspace view) */}
        {!activeProjectId && (
          <header className="h-16 border-b border-slate-800/60 flex items-center justify-between px-6 shrink-0 bg-slate-900/20 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="md:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                aria-label="Open sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-lg font-bold text-white">
                {globalFilter ? globalFilter : 'All Active Tasks'}
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                {visibleTasks.length} tasks
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative hidden sm:block">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Search tasks..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-full pl-9 pr-4 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 w-56"
                />
              </div>
              
              {/* Sort */}
              <select 
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
              >
                <option value="dueDate">Sort by Due Date</option>
                <option value="priority">Sort by Priority</option>
              </select>
            </div>
          </header>
        )}

        {/* View Switcher: Dedicated Workspace vs List View */}
        <main className="flex-1 overflow-x-auto overflow-y-hidden p-0 m-0 relative">
          {error ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={refreshProjects} className="mt-4 text-blue-400 underline text-xs">Retry</button>
            </div>
          ) : isLoading && visibleTasks.length === 0 ? (
            <div className="flex items-center justify-center h-full p-6">
              <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
          ) : activeProjectId ? (
            <ProjectWorkspace 
              projectId={activeProjectId} 
              initialTab={urlTab || 'overview'}
              onTabChange={(tab) => navigateToProject(activeProjectId, tab)}
              onClose={handleCloseWorkspace} 
              onEditProject={(p) => { setEditingProject(p); setIsProjectModalOpen(true); }}
              onAddMember={(p) => { setEditingProject(p); setIsProjectModalOpen(true); }}
              onArchiveProject={archiveProject}
              onRemoveMember={removeMember}
              onLeaveProject={leaveProject}
              onUpdateMemberRole={updateMemberRole}
              onTransferOwnership={transferOwnership}
              onInviteMember={inviteMember}
              onCancelInvitation={cancelInvitation}
              tasks={tasks}
              onEditTask={(task) => { setEditingTask(task); setIsTaskModalOpen(true); }}
              onCreateTask={(status) => { setEditingTask(typeof status === 'string' ? { status, projectId: activeProjectId } : { projectId: activeProjectId, ...status }); setIsTaskModalOpen(true); }}
              onUpdateTask={updateTask}
              onAddTask={addTask}
              onDeleteTask={deleteTask}
              onUpdateTaskStatus={setTaskStatus}
              onAddComment={addComment}
              onDeleteComment={deleteComment}
              refreshProjects={refreshProjects}
            />
          ) : (
            /* Global List View */
            <div className="max-w-4xl mx-auto p-6 overflow-y-auto h-full">
              <div className="bg-slate-900/30 rounded-2xl border border-slate-800/60 overflow-hidden">
                {visibleTasks.length === 0 ? (
                  <div className="p-12 text-center flex flex-col items-center">
                    <ListTodo className="w-12 h-12 text-slate-700 mb-3" />
                    <p className="text-sm text-slate-400 font-medium">No tasks found for this view.</p>
                    <p className="text-xs text-slate-500 mt-1">Select a project or create a new task to get started.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/50">
                    {visibleTasks.map(task => (
                      <div key={task.id} className="p-4 flex items-center gap-4 hover:bg-slate-900/50 transition-colors group">
                        <button
                          onClick={() => setTaskStatus(task.id, task.status === 'Completed' ? 'Todo' : 'Completed')}
                          className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-slate-500 hover:text-blue-400 transition-colors"
                          title="Toggle completion"
                        >
                          {task.status === 'Completed' ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5" />}
                        </button>
                        
                        <div 
                          className="flex-1 min-w-0 flex flex-col cursor-pointer" 
                          onClick={() => { setEditingTask(task); setIsTaskModalOpen(true); }}
                        >
                          <h4 className={`text-xs font-semibold truncate ${task.status === 'Completed' ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                            {task.task || task.title}
                          </h4>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                              task.priority === 'Urgent' || task.priority === 'High' ? 'bg-red-500/10 text-red-400' : 
                              task.priority === 'Medium' ? 'bg-yellow-500/10 text-yellow-400' : 
                              'bg-blue-500/10 text-blue-400'
                            }`}>
                              {task.priority || 'Medium'}
                            </span>
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <CalendarIcon className="w-3 h-3 text-slate-500" />
                              {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No date'}
                            </span>
                            <span className="text-[10px] text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded bg-slate-800/40">
                              {task.status}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {task.assignee && (
                            <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-white border border-slate-700" title={task.assignee.name}>
                              {task.assignee.avatarInitials || task.assignee.name?.[0] || '?'}
                            </div>
                          )}
                          <button
                            onClick={() => setTaskToDeleteId(task.id)}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all"
                            title="Delete task"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Task Modal (Create & Edit) */}
      <TaskModal 
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        initialData={editingTask}
        activeProject={activeProject || (editingTask && projects.find(p => p.id === editingTask.projectId))}
        projects={projects}
        onSubmit={async (taskData) => {
          if (editingTask && editingTask.id) {
            await updateTask(taskData.id, taskData);
            toast.success('Task updated');
          } else {
            await addTask(taskData);
            toast.success('Task created');
          }
        }}
      />
      
      {/* Project Modal (Create & Edit Settings) */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        initialData={editingProject}
        onAddMember={addMember}
        onSubmit={async (projectData) => {
          if (editingProject && editingProject.id) {
            await updateProject(projectData.id, projectData);
            toast.success('Project updated');
          } else {
            const newP = await addProject(projectData);
            toast.success('Project created');
            if (newP && newP.id) {
              setActiveProject(newP.id);
              navigateToProject(newP.id);
            }
          }
        }}
      />

      {/* Delete Task Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(taskToDeleteId)}
        onClose={() => setTaskToDeleteId(null)}
        onConfirm={handleDeleteTaskConfirm}
        title="Delete Task"
        message="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete Task"
        isDanger={true}
        isLoading={isDeletingTask}
      />
    </section>
  );
};

export default DashboardPreview;
