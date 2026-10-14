import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const RouterContext = createContext();

// Helper to parse current path and query params
const parseLocation = () => {
  const hash = window.location.hash.replace(/^#/, '');
  // Prefer hash if present (useful for static preview environments), otherwise pathname
  const path = hash.startsWith('/') ? hash : window.location.pathname;
  const search = window.location.search || (hash.includes('?') ? hash.slice(hash.indexOf('?')) : '');
  const params = new URLSearchParams(search);

  // Match /projects/:projectId or /workspace/:projectId
  const projectMatch = path.match(/^\/(?:projects|workspace)\/([a-zA-Z0-9_-]+)/);
  const projectId = projectMatch ? projectMatch[1] : null;

  return {
    path,
    search,
    params,
    projectId,
    tab: params.get('tab') || null,
    taskId: params.get('task') || null,
  };
};

export const RouterProvider = ({ children }) => {
  const [routeInfo, setRouteInfo] = useState(parseLocation);

  useEffect(() => {
    const handleLocationChange = () => {
      setRouteInfo(parseLocation());
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const navigate = useCallback((to) => {
    if (!to) return;
    
    // Normalize path
    let target = to;
    if (!target.startsWith('/') && !target.startsWith('#')) {
      target = '/' + target;
    }

    try {
      window.history.pushState(null, '', target);
    } catch (e) {
      // Fallback for file:// or restricted origins
      window.location.hash = target;
    }
    setRouteInfo(parseLocation());
  }, []);

  const navigateToProject = useCallback((projectId, section = 'overview') => {
    if (!projectId) {
      navigate('/board');
      return;
    }
    navigate(`/projects/${projectId}?tab=${section}`);
  }, [navigate]);

  return (
    <RouterContext.Provider value={{ 
      ...routeInfo, 
      navigate, 
      navigateToProject 
    }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = () => {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
};
