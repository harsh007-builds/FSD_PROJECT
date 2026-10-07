import React, { useState, useEffect } from 'react';
import { Activity, Clock, BookOpen, Plus, Trash2, CheckCircle2, Circle, Pencil, Users, UserPlus, Search, Calendar, AlertCircle, Inbox, ListTodo, MoreVertical, Calendar as CalendarIcon, MoveRight, Settings } from 'lucide-react';
import { useProjects } from '../hooks/useProjects';
import { useUser } from '../context/UserContext';
import TaskModal from '../components/TaskModal';
import ProjectModal from '../components/ProjectModal';
import ProjectWorkspace from './ProjectWorkspace';

const DashboardPreview = () => {
  const { user } = useUser();
  const { 
    activeProjectId, projects, tasks, isLoading, error, refreshProjects, 
    addTask, updateTask, deleteTask, setTaskStatus, setActiveProject, addProject, updateProject, deleteProject, addMember
  } = useProjects();
  
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  
  const [addingMemberTo, setAddingMemberTo] = useState(null);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [memberError, setMemberError] = useState('');

  // Filters & Search & Sort
  const [globalFilter, setGlobalFilter] = useState(null); // 'My Tasks', 'High Priority', 'Due Today', 'Overdue', 'Completed'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('dueDate'); // 'dueDate', 'priority'

  const activeProject = projects.find(p => p.id === activeProjectId);

  // Derive visible tasks
  let visibleTasks = [];
  if (activeProjectId) {
    visibleTasks = tasks.filter(t => t.projectId === activeProjectId);
  } else if (globalFilter) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    visibleTasks = tasks.filter(t => {
      if (globalFilter === 'My Tasks') {
        return t.assignee && (t.assignee._id === user?._id || t.assignee === user?._id);
      }
      if (globalFilter === 'High Priority') {
        return t.priority === 'High';
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
    // Show all tasks if nothing selected, or just none
    visibleTasks = tasks;
  }

  // Search
  if (searchQuery) {
    visibleTasks = visibleTasks.filter(t => 
      t.task.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }

  // Sort
  visibleTasks.sort((a, b) => {
    if (sortBy === 'priority') {
      const p = { 'High': 3, 'Medium': 2, 'Low': 1 };
      return p[b.priority] - p[a.priority];
    } else {
      // dueDate
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
  });

  const handleAddMember = async (e, projectId) => {
    e.preventDefault();
    setMemberError('');
    if (!newMemberEmail.trim()) return;
    
    try {
      await addMember(projectId, newMemberEmail);
      setAddingMemberTo(null);
      setNewMemberEmail('');
    } catch (err) {
      setMemberError(err.message || 'Failed to add member');
    }
  };

  const onDragStart = (e, taskId) => {
    e.dataTransfer.setData("taskId", taskId);
  };

  const onDragOver = (e) => {
    e.preventDefault();
  };

  const onDrop = async (e, status) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (!taskId) return;
    
    const task = tasks.find(t => t.id === taskId);
    if (task && task.status !== status) {
      try {
        await updateTask(taskId, { ...task, status });
      } catch (err) {
        alert("Failed to update status");
      }
    }
  };

  const handleSelectFilter = (filter) => {
    setGlobalFilter(filter);
    setActiveProject(null);
  };

  const handleSelectProject = (projectId) => {
    setActiveProject(projectId);
    setGlobalFilter(null);
  };

  return (
    <section className="h-[calc(100vh-64px)] overflow-hidden bg-slate-950 flex relative">
      {/* Sidebar */}
      <div className="w-64 border-r border-slate-800 bg-slate-950 flex flex-col h-full overflow-y-auto hidden md:flex shrink-0">
        <div className="p-4 border-b border-slate-800/50">
          <button 
            onClick={() => { setEditingTask(null); setIsTaskModalOpen(true); }}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>

        {/* Global Filters */}
        <div className="p-3 space-y-1">
          <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Views</p>
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
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${globalFilter === f.label ? 'bg-blue-500/10 text-blue-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'}`}
            >
              <f.icon className="w-4 h-4" /> {f.label}
            </button>
          ))}
        </div>

        {/* Projects */}
        <div className="p-3 flex-1">
          <div className="flex items-center justify-between px-3 mb-2 mt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Projects</p>
            <button 
              onClick={() => { setEditingProject(null); setIsProjectModalOpen(true); }}
              className="text-slate-400 hover:text-blue-400 p-1"
              aria-label="Add project"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          
          <div className="space-y-1">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => handleSelectProject(p.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeProjectId === p.id ? 'bg-blue-500/10 text-blue-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'}`}
              >
                <div className="flex items-center gap-2 truncate">
                  <div className={`w-2 h-2 rounded-full ${p.status === 'Completed' ? 'bg-green-500' : p.status === 'On Hold' ? 'bg-yellow-500' : 'bg-blue-500'}`} />
                  <span className="truncate">{p.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0A0F1C]">
        
        {/* Header Toolbar */}
        <header className="h-16 border-b border-slate-800/50 flex items-center justify-between px-6 shrink-0 bg-slate-900/20 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-white">
              {activeProject ? activeProject.name : globalFilter ? globalFilter : 'All Tasks'}
            </h1>
            {activeProject && (
              <span className="px-2 py-1 bg-slate-800 rounded text-xs font-medium text-slate-400 border border-slate-700">
                {activeProject.status || 'Active'}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search tasks..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-full pl-9 pr-4 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 w-64"
              />
            </div>
            
            {/* Sort */}
            <select 
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
            >
              <option value="dueDate">Sort by Due Date</option>
              <option value="priority">Sort by Priority</option>
            </select>
            
            {activeProject && activeProject.owner && user && activeProject.owner._id === user._id && (
              <button 
                onClick={() => { setEditingProject(activeProject); setIsProjectModalOpen(true); }}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"
                title="Project Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Board / List Area */}
        <main className="flex-1 overflow-x-auto overflow-y-hidden p-0 m-0 relative">
          {error ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <p className="text-red-400">{error}</p>
              <button onClick={refreshProjects} className="mt-4 text-blue-400 underline text-sm">Retry</button>
            </div>
          ) : isLoading && visibleTasks.length === 0 ? (
            <div className="flex items-center justify-center h-full p-6">
              <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
          ) : activeProjectId ? (
            <ProjectWorkspace 
              projectId={activeProjectId} 
              onClose={() => setActiveProject(null)} 
              onEditProject={(p) => { setEditingProject(p); setIsProjectModalOpen(true); }}
              onAddMember={(p) => { setEditingProject(p); setIsProjectModalOpen(true); }}
              tasks={tasks}
              onEditTask={(task) => { setEditingTask(task); setIsTaskModalOpen(true); }}
              onCreateTask={(status) => { setEditingTask({ status, projectId: activeProjectId }); setIsTaskModalOpen(true); }}
              onDeleteTask={async (id) => { try { await deleteTask(id); } catch(err) { alert(err.message); } }}
              onUpdateTaskStatus={setTaskStatus}
              refreshProjects={refreshProjects}
            />
          ) : (
            /* List View for Global Filters */
            <div className="max-w-4xl mx-auto p-6">
              <div className="bg-slate-900/30 rounded-2xl border border-slate-800/50 overflow-hidden">
                {visibleTasks.length === 0 ? (
                  <div className="p-12 text-center flex flex-col items-center">
                    <ListTodo className="w-12 h-12 text-slate-700 mb-4" />
                    <p className="text-slate-400">No tasks found for this view.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/50">
                    {visibleTasks.map(task => (
                      <div key={task.id} className="p-4 flex items-center gap-4 hover:bg-slate-900/50 transition-colors group">
                        <button
                          onClick={() => setTaskStatus(task.id, task.status === 'Completed' ? 'Todo' : 'Completed')}
                          className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-slate-500 hover:text-blue-400 transition-colors"
                        >
                          {task.status === 'Completed' ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5" />}
                        </button>
                        
                        <div className="flex-1 min-w-0 flex flex-col cursor-pointer" onClick={() => { setEditingTask(task); setIsTaskModalOpen(true); }}>
                          <h4 className={`text-sm font-medium truncate ${task.status === 'Completed' ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                            {task.task}
                          </h4>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                              task.priority === 'High' ? 'bg-red-500/10 text-red-400' : 
                              task.priority === 'Medium' ? 'bg-yellow-500/10 text-yellow-400' : 
                              'bg-blue-500/10 text-blue-400'
                            }`}>
                              {task.priority || 'Medium'}
                            </span>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <CalendarIcon className="w-3 h-3" />
                              {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No date'}
                            </span>
                            <span className="text-xs text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded bg-slate-800/50">
                              {task.status}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          {task.assignee && (
                            <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-white border border-slate-700" title={task.assignee.name}>
                              {task.assignee.avatarInitials || '?'}
                            </div>
                          )}
                          <button
                            onClick={async () => {
                              if (window.confirm('Delete this task?')) {
                                try { await deleteTask(task.id); } catch(err) { alert(err.message); }
                              }
                            }}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all"
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

      <TaskModal 
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        initialData={editingTask}
        activeProject={activeProject || (editingTask && projects.find(p => p.id === editingTask.projectId))}
        projects={projects}
        onSubmit={(taskData) => {
          if (editingTask && editingTask.id) {
            updateTask(taskData.id, taskData);
          } else {
            addTask(taskData);
          }
        }}
      />
      
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        initialData={editingProject}
        onAddMember={addMember}
        onSubmit={async (projectData) => {
          if (editingProject && editingProject.id) {
            await updateProject(projectData.id, projectData);
          } else {
            await addProject(projectData);
          }
        }}
      />
    </section>
  );
};

export default DashboardPreview;
