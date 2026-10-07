const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Helper to handle API responses
const handleResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API Error: ${response.status}`);
  }
  return response.json();
};

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
};

export const authService = {
  login: (data) => fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(handleResponse),
  
  register: (data) => fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(handleResponse),
  
  getMe: () => fetch(`${API_URL}/auth/me`, {
    headers: getAuthHeaders()
  }).then(handleResponse),
};

export const projectService = {
  getProjects: () => fetch(`${API_URL}/projects`, { headers: getAuthHeaders() }).then(handleResponse),
  
  getProjectById: (id) => fetch(`${API_URL}/projects/${id}`, { headers: getAuthHeaders() }).then(handleResponse),
  
  createProject: (data) => fetch(`${API_URL}/projects`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  }).then(handleResponse),
  
  updateProject: (id, data) => fetch(`${API_URL}/projects/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  }).then(handleResponse),
  
  deleteProject: (id) => fetch(`${API_URL}/projects/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  }).then(handleResponse),
  
  addMember: (id, email) => fetch(`${API_URL}/projects/${id}/members`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ email })
  }).then(handleResponse),
  
  getWorkspaceData: (id) => fetch(`${API_URL}/projects/${id}/workspace`, {
    headers: getAuthHeaders()
  }).then(handleResponse)
};

export const taskService = {
  getAllTasks: () => fetch(`${API_URL}/tasks`, { headers: getAuthHeaders() }).then(handleResponse),
  
  getTasksByProject: (projectId) => fetch(`${API_URL}/projects/${projectId}/tasks`, { headers: getAuthHeaders() }).then(handleResponse),
  
  createTask: (projectId, data) => fetch(`${API_URL}/projects/${projectId}/tasks`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  }).then(handleResponse),
  
  updateTask: (id, data) => fetch(`${API_URL}/tasks/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  }).then(handleResponse),
  
  updateTaskStatus: (id, status) => fetch(`${API_URL}/tasks/${id}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status })
  }).then(handleResponse),
  
  deleteTask: (id) => fetch(`${API_URL}/tasks/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  }).then(handleResponse),
};

export const dashboardService = {
  getStats: () => fetch(`${API_URL}/dashboard/stats`, { headers: getAuthHeaders() }).then(handleResponse),
};

export const activityService = {
  getActivities: () => fetch(`${API_URL}/activities`, { headers: getAuthHeaders() }).then(handleResponse),
};

export const notificationService = {
  getNotifications: () => fetch(`${API_URL}/notifications`, { headers: getAuthHeaders() }).then(handleResponse),
  
  getUnreadCount: () => fetch(`${API_URL}/notifications/unread-count`, { headers: getAuthHeaders() }).then(handleResponse),
  
  markAsRead: (id) => fetch(`${API_URL}/notifications/${id}/read`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  }).then(handleResponse),
  
  markAllAsRead: () => fetch(`${API_URL}/notifications/read-all`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  }).then(handleResponse),
};
