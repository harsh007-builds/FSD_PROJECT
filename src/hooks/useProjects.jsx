import { useEffect, useCallback } from 'react';
import { useProjectContext } from '../context/ProjectContext';
import { projectService, taskService } from '../services/api';

// Mappers to translate MongoDB documents to our frontend state structure
export const mapProject = (dbProject) => ({
  id: dbProject._id || dbProject.id,
  name: dbProject.name,
  progress: typeof dbProject.progress === 'number' ? dbProject.progress : 0,
  description: dbProject.description,
  status: dbProject.status,
  startDate: dbProject.startDate,
  deadline: dbProject.deadline,
  owner: dbProject.owner,
  members: dbProject.members || [],
  memberRoles: dbProject.memberRoles || [],
  totalTasks: dbProject.totalTasks,
  completedTasks: dbProject.completedTasks,
});

export const mapTask = (dbTask) => ({
  id: dbTask._id || dbTask.id,
  projectId: dbTask.project?._id || dbTask.project,
  project: dbTask.project,
  task: dbTask.title,
  title: dbTask.title, // aliased for consistent symbol usage
  description: dbTask.description,
  priority: dbTask.priority,
  type: dbTask.type || 'Task',
  status: dbTask.status,
  assignee: dbTask.assignee, // Can be user object if populated, or ID
  createdBy: dbTask.createdBy,
  dueDate: dbTask.dueDate,
  labels: dbTask.labels || [],
  order: typeof dbTask.order === 'number' ? dbTask.order : 0,
  comments: dbTask.comments || [],
});

// ----------------------------------------------------------------------
// CUSTOM HOOK: useProjects
// ----------------------------------------------------------------------
export const useProjects = () => {
  const { state, dispatch } = useProjectContext();
  const { activeProjectId, projects, tasks, isLoading, error } = state;

  const fetchProjects = useCallback(async () => {
    dispatch({ type: 'FETCH_INIT' });
    try {
      const [dbProjects, dbTasks] = await Promise.all([
        projectService.getProjects(),
        taskService.getAllTasks(),
      ]);

      dispatch({ 
        type: 'FETCH_SUCCESS', 
        payload: { 
          projects: dbProjects.map(mapProject), 
          tasks: dbTasks.map(mapTask) 
        } 
      });
    } catch (error) {
      console.error("Failed to load project data:", error);
      dispatch({ type: 'FETCH_ERROR', payload: error.message || 'Failed to load project data. Please try again.' });
    }
  }, [dispatch]);

  // Action Dispatchers linked to API
  const addTask = useCallback(async (taskData) => {
    try {
      const dbTask = await taskService.createTask(taskData.projectId || activeProjectId, {
        title: taskData.task || taskData.title,
        description: taskData.description,
        priority: taskData.priority,
        type: taskData.type || 'Task',
        status: taskData.status,
        assignee: taskData.assignee || null,
        dueDate: taskData.dueDate || null,
        labels: taskData.labels || [],
        order: taskData.order || 0,
      });
      dispatch({ type: 'ADD_TASK', payload: mapTask(dbTask) });
      return mapTask(dbTask);
    } catch (err) {
      console.error('Failed to add task:', err);
      dispatch({ type: 'FETCH_ERROR', payload: err.message || 'Failed to create task.' });
      throw err;
    }
  }, [dispatch, activeProjectId]);

  const updateTask = useCallback(async (id, updates) => {
    try {
      const dbUpdates = {};
      if (updates.task) dbUpdates.title = updates.task;
      if (updates.title) dbUpdates.title = updates.title;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.priority) dbUpdates.priority = updates.priority;
      if (updates.type) dbUpdates.type = updates.type;
      if (updates.status) dbUpdates.status = updates.status;
      if (updates.assignee !== undefined) dbUpdates.assignee = updates.assignee || null;
      if (updates.dueDate !== undefined) dbUpdates.dueDate = updates.dueDate || null;
      if (updates.labels !== undefined) dbUpdates.labels = updates.labels;
      if (updates.order !== undefined) dbUpdates.order = updates.order;

      const updatedDbTask = await taskService.updateTask(id, dbUpdates);
      dispatch({ type: 'UPDATE_TASK', payload: { id, updates: mapTask(updatedDbTask) } });
      return mapTask(updatedDbTask);
    } catch (err) {
      console.error('Failed to update task:', err);
      dispatch({ type: 'FETCH_ERROR', payload: err.message || 'Failed to update task.' });
      throw err;
    }
  }, [dispatch]);

  const deleteTask = useCallback(async (id) => {
    try {
      await taskService.deleteTask(id);
      dispatch({ type: 'DELETE_TASK', payload: id });
    } catch (err) {
      console.error('Failed to delete task:', err);
      dispatch({ type: 'FETCH_ERROR', payload: 'Failed to delete task.' });
      throw err;
    }
  }, [dispatch]);

  const setTaskStatus = useCallback(async (id, status, order) => {
    try {
      dispatch({ type: 'SET_TASK_STATUS', payload: { id, status, order } });
      await taskService.updateTaskStatus(id, status, order);
    } catch (err) {
      console.error('Failed to update task status:', err);
      dispatch({ type: 'FETCH_ERROR', payload: 'Failed to update task status.' });
      fetchProjects();
      throw err;
    }
  }, [dispatch, fetchProjects]);

  const completeTask = useCallback((id) => {
    return setTaskStatus(id, 'Completed');
  }, [setTaskStatus]);

  const addComment = useCallback(async (taskId, text) => {
    try {
      const updatedDbTask = await taskService.addComment(taskId, text);
      const mapped = mapTask(updatedDbTask);
      dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: mapped } });
      return mapped;
    } catch (err) {
      console.error('Failed to add comment:', err);
      throw err;
    }
  }, [dispatch]);

  const deleteComment = useCallback(async (taskId, commentId) => {
    try {
      const updatedDbTask = await taskService.deleteComment(taskId, commentId);
      const mapped = mapTask(updatedDbTask);
      dispatch({ type: 'UPDATE_TASK', payload: { id: taskId, updates: mapped } });
      return mapped;
    } catch (err) {
      console.error('Failed to delete comment:', err);
      throw err;
    }
  }, [dispatch]);

  const setActiveProject = useCallback((projectId) => {
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
  }, [dispatch]);

  const addProject = useCallback(async (projectData) => {
    try {
      const dbProject = await projectService.createProject({
        name: projectData.name,
        description: projectData.description,
        status: projectData.status,
        startDate: projectData.startDate,
        deadline: projectData.deadline,
        progress: projectData.progress || 0,
      });
      const mapped = mapProject(dbProject);
      dispatch({ type: 'ADD_PROJECT', payload: mapped });
      return mapped;
    } catch (err) {
      console.error('Failed to add project:', err);
      dispatch({ type: 'FETCH_ERROR', payload: 'Failed to create project.' });
      throw err;
    }
  }, [dispatch]);

  const updateProject = useCallback(async (id, updates) => {
    try {
      const updatedDbProject = await projectService.updateProject(id, updates);
      const mapped = mapProject(updatedDbProject);
      dispatch({ type: 'UPDATE_PROJECT', payload: { id, updates: mapped } });
      return mapped;
    } catch (err) {
      console.error('Failed to update project:', err);
      dispatch({ type: 'FETCH_ERROR', payload: 'Failed to update project.' });
      throw err;
    }
  }, [dispatch]);

  const archiveProject = useCallback(async (id) => {
    try {
      const updatedDbProject = await projectService.archiveProject(id);
      const mapped = mapProject(updatedDbProject);
      dispatch({ type: 'UPDATE_PROJECT', payload: { id, updates: mapped } });
      return mapped;
    } catch (err) {
      console.error('Failed to archive project:', err);
      dispatch({ type: 'FETCH_ERROR', payload: 'Failed to toggle project archive status.' });
      throw err;
    }
  }, [dispatch]);

  const deleteProject = useCallback(async (id) => {
    try {
      await projectService.deleteProject(id);
      dispatch({ type: 'DELETE_PROJECT', payload: id });
    } catch (err) {
      console.error('Failed to delete project:', err);
      dispatch({ type: 'FETCH_ERROR', payload: 'Failed to delete project.' });
      throw err;
    }
  }, [dispatch]);

  const addMember = useCallback(async (projectId, email) => {
    try {
      const updatedDbProject = await projectService.addMember(projectId, email);
      const mapped = mapProject(updatedDbProject);
      dispatch({ type: 'UPDATE_PROJECT', payload: { id: projectId, updates: mapped } });
      return mapped;
    } catch (err) {
      console.error('Failed to add member:', err);
      dispatch({ type: 'FETCH_ERROR', payload: err.message || 'Failed to add member.' });
      throw err;
    }
  }, [dispatch]);

  const removeMember = useCallback(async (projectId, userId) => {
    try {
      const updatedDbProject = await projectService.removeMember(projectId, userId);
      const mapped = mapProject(updatedDbProject);
      dispatch({ type: 'UPDATE_PROJECT', payload: { id: projectId, updates: mapped } });
      return mapped;
    } catch (err) {
      console.error('Failed to remove member:', err);
      dispatch({ type: 'FETCH_ERROR', payload: err.message || 'Failed to remove member.' });
      throw err;
    }
  }, [dispatch]);

  const leaveProject = useCallback(async (projectId) => {
    try {
      await projectService.leaveProject(projectId);
      dispatch({ type: 'DELETE_PROJECT', payload: projectId });
    } catch (err) {
      console.error('Failed to leave project:', err);
      dispatch({ type: 'FETCH_ERROR', payload: err.message || 'Failed to leave project.' });
      throw err;
    }
  }, [dispatch]);

  const updateMemberRole = useCallback(async (projectId, userId, role) => {
    try {
      const updatedDbProject = await projectService.updateMemberRole(projectId, userId, role);
      const mapped = mapProject(updatedDbProject);
      dispatch({ type: 'UPDATE_PROJECT', payload: { id: projectId, updates: mapped } });
      return mapped;
    } catch (err) {
      console.error('Failed to update member role:', err);
      dispatch({ type: 'FETCH_ERROR', payload: err.message || 'Failed to update member role.' });
      throw err;
    }
  }, [dispatch]);

  const transferOwnership = useCallback(async (projectId, newOwnerId) => {
    try {
      const updatedDbProject = await projectService.transferOwnership(projectId, newOwnerId);
      const mapped = mapProject(updatedDbProject);
      dispatch({ type: 'UPDATE_PROJECT', payload: { id: projectId, updates: mapped } });
      return mapped;
    } catch (err) {
      console.error('Failed to transfer ownership:', err);
      dispatch({ type: 'FETCH_ERROR', payload: err.message || 'Failed to transfer ownership.' });
      throw err;
    }
  }, [dispatch]);

  const inviteMember = useCallback(async (projectId, data) => {
    try {
      return await projectService.inviteMember(projectId, data);
    } catch (err) {
      console.error('Failed to invite member:', err);
      throw err;
    }
  }, []);

  const cancelInvitation = useCallback(async (projectId, inviteId) => {
    try {
      return await projectService.cancelInvitation(projectId, inviteId);
    } catch (err) {
      console.error('Failed to cancel invitation:', err);
      throw err;
    }
  }, []);

  // Initial fetch from DB
  useEffect(() => {
    if (projects.length === 0 && tasks.length === 0 && isLoading) {
      fetchProjects();
    }
  }, [fetchProjects, projects.length, tasks.length, isLoading]);

  return {
    activeProjectId,
    projects,
    tasks,
    deadlines: tasks, // aliased for backward compatibility
    isLoading,
    error,
    refreshProjects: fetchProjects,
    addTask,
    updateTask,
    deleteTask,
    setTaskStatus,
    completeTask,
    addComment,
    deleteComment,
    setActiveProject,
    addProject,
    updateProject,
    archiveProject,
    deleteProject,
    addMember,
    removeMember,
    leaveProject,
    updateMemberRole,
    transferOwnership,
    inviteMember,
    cancelInvitation,
  };
};
