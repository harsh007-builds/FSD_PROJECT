import React, { createContext, useReducer, useContext, useEffect } from 'react';

// ----------------------------------------------------------------------
// CONTEXT: ProjectContext (Experiment 3)
// WHY: Manages complex state (projects, tasks, loading, errors) centrally 
// using useReducer. This mimics Redux architecture in a lightweight way.
// ----------------------------------------------------------------------

// 1. Define the Initial State
const initialState = {
  activeProjectId: null,
  projects: [],
  tasks: [], // Formerly deadlines
  isLoading: true,
  error: null,
};

// 2. Define the Reducer Function
const projectReducer = (state, action) => {
  switch (action.type) {
    case 'FETCH_INIT':
      return { ...state, isLoading: true, error: null };
      
    case 'FETCH_SUCCESS':
      return {
        ...state,
        isLoading: false,
        projects: action.payload.projects,
        tasks: action.payload.tasks,
        activeProjectId: state.activeProjectId || (action.payload.projects.length > 0 ? action.payload.projects[0].id : null)
      };
      
    case 'FETCH_ERROR':
      return { ...state, isLoading: false, error: action.payload };

    case 'SET_ACTIVE_PROJECT':
      return { ...state, activeProjectId: action.payload };
      
    case 'ADD_TASK':
      return { ...state, tasks: [...state.tasks, action.payload] };

    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map(task => 
          task.id === action.payload.id ? { ...task, ...action.payload.updates } : task
        )
      };

    case 'SET_TASK_STATUS':
      return {
        ...state,
        tasks: state.tasks.map(task => 
          task.id === action.payload.id ? { ...task, status: action.payload.status } : task
        )
      };
      
    case 'DELETE_TASK':
      return {
        ...state,
        tasks: state.tasks.filter((task) => task.id !== action.payload),
      };

    case 'ADD_PROJECT':
      return { ...state, projects: [...state.projects, action.payload] };

    case 'UPDATE_PROJECT':
      return {
        ...state,
        projects: state.projects.map(project => 
          project.id === action.payload.id ? { ...project, ...action.payload.updates } : project
        )
      };

    case 'DELETE_PROJECT':
      return {
        ...state,
        projects: state.projects.filter((project) => project.id !== action.payload),
        // If the active project is deleted, clear the active project
        activeProjectId: state.activeProjectId === action.payload ? null : state.activeProjectId
      };
      
    default:
      throw new Error(`Unhandled action type: ${action.type}`);
  }
};

// 3. Create Context
const ProjectContext = createContext(undefined);

// 4. Create Provider Component
export const ProjectProvider = ({ children }) => {
  const [state, dispatch] = useReducer(projectReducer, initialState);



  return (
    <ProjectContext.Provider value={{ state, dispatch }}>
      {children}
    </ProjectContext.Provider>
  );
};

// 5. Custom Hook for Safe Consumption
export const useProjectContext = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
};
