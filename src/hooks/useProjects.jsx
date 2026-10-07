import { useEffect, useCallback } from 'react';
import { useProjectContext } from '../context/ProjectContext';
import { projectService, taskService } from '../services/api';

// Mappers to translate MongoDB documents to our frontend state structure
export const mapProject = (dbProject) => ({
  id: dbProject._id,
  name: dbProject.name,
  progress: dbProject.progress,
  description: dbProject.description,
  status: dbProject.status,
  startDate: dbProject.startDate,
  deadline: dbProject.deadline,
  owner: dbProject.owner,
  members: dbProject.members || [],
});

export const mapTask = (dbTask) => ({
  id: dbTask._id,
  projectId: dbTask.project,
  task: dbTask.title,
  description: dbTask.description,
  priority: dbTask.priority,
  status: dbTask.status,
  assignee: dbTask.assignee, // Can be user object if populated, or ID
  createdBy: dbTask.createdBy,
  dueDate: dbTask.dueDate,
  labels: dbTask.labels || [],
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
        title: taskData.task,
        description: taskData.description,
        priority: taskData.priority,
        status: taskData.status,
        assignee: taskData.assignee || null,
        dueDate: taskData.dueDate || null,
        labels: taskData.labels || [],
      });
      dispatch({ type: 'ADD_TASK', payload: mapTask(dbTask) });
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
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.priority) dbUpdates.priority = updates.priority;
      if (updates.status) dbUpdates.status = updates.status;
      if (updates.assignee !== undefined) dbUpdates.assignee = updates.assignee || null;
      if (updates.dueDate !== undefined) dbUpdates.dueDate = updates.dueDate || null;
      if (updates.labels !== undefined) dbUpdates.labels = updates.labels;

      const updatedDbTask = await taskService.updateTask(id, dbUpdates);
      dispatch({ type: 'UPDATE_TASK', payload: { id, updates: mapTask(updatedDbTask) } });
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

  const setTaskStatus = useCallback(async (id, status) => {
    try {
      dispatch({ type: 'SET_TASK_STATUS', payload: { id, status } });
      await taskService.updateTaskStatus(id, status);
    } catch (err) {
      console.error('Failed to update task status:', err);
      dispatch({ type: 'FETCH_ERROR', payload: 'Failed to update task status.' });
      fetchProjects();
      throw err;
    }
  }, [dispatch, fetchProjects]);

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
      dispatch({ type: 'ADD_PROJECT', payload: mapProject(dbProject) });
    } catch (err) {
      console.error('Failed to add project:', err);
      dispatch({ type: 'FETCH_ERROR', payload: 'Failed to create project.' });
      throw err;
    }
  }, [dispatch]);

  const updateProject = useCallback(async (id, updates) => {
    try {
      const updatedDbProject = await projectService.updateProject(id, updates);
      dispatch({ type: 'UPDATE_PROJECT', payload: { id, updates: mapProject(updatedDbProject) } });
    } catch (err) {
      console.error('Failed to update project:', err);
      dispatch({ type: 'FETCH_ERROR', payload: 'Failed to update project.' });
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
      dispatch({ type: 'UPDATE_PROJECT', payload: { id: projectId, updates: mapProject(updatedDbProject) } });
    } catch (err) {
      console.error('Failed to add member:', err);
      dispatch({ type: 'FETCH_ERROR', payload: 'Failed to add member.' });
      throw err;
    }
  }, [dispatch]);

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
    setActiveProject,
    addProject,
    updateProject,
    deleteProject,
    completeTask: deleteTask,
    addMember,
  };
};
