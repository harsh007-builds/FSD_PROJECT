import React from 'react';
import { useProjects } from '../hooks/useProjects';
import { useUser } from '../context/UserContext';
import IntegratedCalendar from '../components/IntegratedCalendar';

const CalendarView = () => {
  const { user } = useUser();
  const { 
    tasks, 
    projects, 
    addTask, 
    updateTask, 
    deleteTask, 
    updateTaskStatus, 
    addComment, 
    deleteComment, 
    isLoading 
  } = useProjects();

  return (
    <div className="h-full w-full overflow-hidden flex flex-col">
      <IntegratedCalendar
        projects={projects}
        tasks={tasks}
        onAddTask={addTask}
        onUpdateTask={updateTask}
        onDeleteTask={deleteTask}
        onTaskStatusChange={updateTaskStatus}
        onAddComment={addComment}
        onDeleteComment={deleteComment}
        currentUser={user}
        isLoading={isLoading}
        title="Personal Calendar & Deadlines"
      />
    </div>
  );
};

export default CalendarView;
