import React, { useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useProjectContext } from '../context/ProjectContext';
import { mapTask, mapProject } from '../hooks/useProjects';
import { projectService } from '../services/api';

const RealtimeManager = () => {
  const { socketService, isConnected } = useSocket();
  const { state, dispatch } = useProjectContext();

  useEffect(() => {
    if (!isConnected || !socketService) return;

    if (state.activeProjectId) {
      socketService.joinProject(state.activeProjectId);
    }

    return () => {
      if (state.activeProjectId) {
        socketService.leaveProject(state.activeProjectId);
      }
    };
  }, [isConnected, socketService, state.activeProjectId]);

  useEffect(() => {
    if (!isConnected || !socketService) return;

    const handleTaskCreated = (task) => {
      dispatch({ type: 'ADD_TASK', payload: mapTask(task) });
    };

    const handleTaskUpdated = (task) => {
      const mappedTask = mapTask(task);
      dispatch({ type: 'UPDATE_TASK', payload: { id: mappedTask.id, updates: mappedTask } });
    };

    const handleTaskDeleted = ({ taskId }) => {
      dispatch({ type: 'DELETE_TASK', payload: taskId });
    };

    const handleMemberAdded = async (data) => {
      if (data?.projectId) {
        try {
          const dbProject = await projectService.getProjectById(data.projectId);
          dispatch({ type: 'UPDATE_PROJECT', payload: { id: data.projectId, updates: mapProject(dbProject) } });
        } catch (err) {
          console.error('Failed to update project on member_added:', err);
        }
      }
    };

    socketService.on('task:created', handleTaskCreated);
    socketService.on('task:updated', handleTaskUpdated);
    socketService.on('task:deleted', handleTaskDeleted);
    socketService.on('member_added', handleMemberAdded);

    return () => {
      socketService.off('task:created', handleTaskCreated);
      socketService.off('task:updated', handleTaskUpdated);
      socketService.off('task:deleted', handleTaskDeleted);
      socketService.off('member_added', handleMemberAdded);
    };
  }, [isConnected, socketService, dispatch]);

  return null; // This component does not render anything
};

export default RealtimeManager;
