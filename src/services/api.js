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

  searchUsers: (query) => fetch(`${API_URL}/auth/users/search?q=${encodeURIComponent(query)}`, {
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
  
  archiveProject: (id) => fetch(`${API_URL}/projects/${id}/archive`, {
    method: 'PATCH',
    headers: getAuthHeaders()
  }).then(handleResponse),
  
  addMember: (id, email) => fetch(`${API_URL}/projects/${id}/members`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ email })
  }).then(handleResponse),
  
  removeMember: (id, userId) => fetch(`${API_URL}/projects/${id}/members/${userId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  }).then(handleResponse),

  updateMemberRole: (id, userId, role) => fetch(`${API_URL}/projects/${id}/members/${userId}/role`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ role })
  }).then(handleResponse),

  transferOwnership: (id, newOwnerId) => fetch(`${API_URL}/projects/${id}/transfer-ownership`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ newOwnerId })
  }).then(handleResponse),

  getProjectInvitations: (id) => fetch(`${API_URL}/projects/${id}/invitations`, {
    headers: getAuthHeaders()
  }).then(handleResponse),

  inviteMember: (id, data) => fetch(`${API_URL}/projects/${id}/invitations`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  }).then(handleResponse),

  cancelInvitation: (id, inviteId) => fetch(`${API_URL}/projects/${id}/invitations/${inviteId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  }).then(handleResponse),
  
  leaveProject: (id) => fetch(`${API_URL}/projects/${id}/leave`, {
    method: 'POST',
    headers: getAuthHeaders()
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
  
  updateTaskStatus: (id, status, order) => fetch(`${API_URL}/tasks/${id}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status, order })
  }).then(handleResponse),
  
  deleteTask: (id) => fetch(`${API_URL}/tasks/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  }).then(handleResponse),
  
  addComment: (id, text) => fetch(`${API_URL}/tasks/${id}/comments`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ text })
  }).then(handleResponse),
  
  deleteComment: (id, commentId) => fetch(`${API_URL}/tasks/${id}/comments/${commentId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  }).then(handleResponse),
};

export const dashboardService = {
  getStats: (params = {}) => {
    const query = new URLSearchParams();
    if (params.projectId && params.projectId !== 'all') query.append('projectId', params.projectId);
    if (params.timeRange) query.append('timeRange', params.timeRange);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return fetch(`${API_URL}/dashboard/stats${queryString}`, { headers: getAuthHeaders() }).then(handleResponse);
  },
};

export const activityService = {
  getActivities: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/activities${query ? `?${query}` : ''}`, { headers: getAuthHeaders() }).then(handleResponse);
  },
  getProjectActivities: (projectId, page = 1, limit = 20) => 
    fetch(`${API_URL}/projects/${projectId}/activities?page=${page}&limit=${limit}`, { headers: getAuthHeaders() }).then(handleResponse),
};

export const notificationService = {
  getNotifications: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/notifications${query ? `?${query}` : ''}`, { headers: getAuthHeaders() }).then(handleResponse);
  },
  
  getUnreadCount: () => fetch(`${API_URL}/notifications/unread-count`, { headers: getAuthHeaders() }).then(handleResponse),
  
  markAsRead: (id) => fetch(`${API_URL}/notifications/${id}/read`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  }).then(handleResponse),
  
  markAllAsRead: () => fetch(`${API_URL}/notifications/read-all`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  }).then(handleResponse),

  deleteNotification: (id) => fetch(`${API_URL}/notifications/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }).then(handleResponse),

  clearAllReadNotifications: () => fetch(`${API_URL}/notifications`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }).then(handleResponse),

  getPreferences: () => fetch(`${API_URL}/notifications/preferences`, {
    headers: getAuthHeaders(),
  }).then(handleResponse),

  updatePreferences: (preferences) => fetch(`${API_URL}/notifications/preferences`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(preferences),
  }).then(handleResponse),

  checkDeadlineReminders: () => fetch(`${API_URL}/notifications/check-deadlines`, {
    method: 'POST',
    headers: getAuthHeaders(),
  }).then(handleResponse),
};

export const invitationService = {
  getMyInvitations: () => fetch(`${API_URL}/invitations/my`, {
    headers: getAuthHeaders()
  }).then(handleResponse),

  acceptInvitation: (id) => fetch(`${API_URL}/invitations/${id}/accept`, {
    method: 'POST',
    headers: getAuthHeaders()
  }).then(handleResponse),

  declineInvitation: (id) => fetch(`${API_URL}/invitations/${id}/decline`, {
    method: 'POST',
    headers: getAuthHeaders()
  }).then(handleResponse),
};

export const searchService = {
  search: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/search${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },

  getMyTasks: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/search/my-tasks${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },

  getSavedFilters: () => fetch(`${API_URL}/search/saved-filters`, {
    headers: getAuthHeaders(),
  }).then(handleResponse),

  createSavedFilter: (data) => fetch(`${API_URL}/search/saved-filters`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  }).then(handleResponse),

  deleteSavedFilter: (id) => fetch(`${API_URL}/search/saved-filters/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }).then(handleResponse),
};

export const resourceService = {
  getResources: (projectId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/projects/${projectId}/resources${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },

  getResourceById: (projectId, resourceId) => {
    return fetch(`${API_URL}/projects/${projectId}/resources/${resourceId}`, {
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },

  createLinkResource: (projectId, data) => {
    return fetch(`${API_URL}/projects/${projectId}/resources`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ...data, type: 'link' }),
    }).then(handleResponse);
  },

  uploadFileResource: (projectId, formData, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/projects/${projectId}/resources`);

      const token = localStorage.getItem('token');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent, event.loaded, event.total);
          }
        };
      }

      xhr.onload = () => {
        try {
          const response = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(response);
          } else {
            reject(new Error(response.message || `Upload failed with status ${xhr.status}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during file upload'));
      xhr.ontimeout = () => reject(new Error('File upload timed out'));

      xhr.send(formData);
    });
  },

  updateResource: (projectId, resourceId, data) => {
    return fetch(`${API_URL}/projects/${projectId}/resources/${resourceId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  deleteResource: (projectId, resourceId) => {
    return fetch(`${API_URL}/projects/${projectId}/resources/${resourceId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },

  getDownloadUrl: (projectId, resourceId) => {
    return `${API_URL}/projects/${projectId}/resources/${resourceId}/download`;
  },

  getPreviewUrl: (projectId, resourceId) => {
    return `${API_URL}/projects/${projectId}/resources/${resourceId}/preview`;
  },
};

export const messageService = {
  getMessages: (projectId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/projects/${projectId}/messages${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },

  sendMessage: (projectId, data) => {
    return fetch(`${API_URL}/projects/${projectId}/messages`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  updateMessage: (projectId, messageId, data) => {
    return fetch(`${API_URL}/projects/${projectId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  deleteMessage: (projectId, messageId) => {
    return fetch(`${API_URL}/projects/${projectId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },

  markMessagesAsRead: (projectId) => {
    return fetch(`${API_URL}/projects/${projectId}/messages/read`, {
      method: 'POST',
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },

  getUnreadCount: (projectId) => {
    return fetch(`${API_URL}/projects/${projectId}/messages/unread-count`, {
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },
};

export const noteService = {
  getNotes: (projectId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/projects/${projectId}/notes${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },

  getNoteById: (projectId, noteId) => {
    return fetch(`${API_URL}/projects/${projectId}/notes/${noteId}`, {
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },

  createNote: (projectId, data) => {
    return fetch(`${API_URL}/projects/${projectId}/notes`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  updateNote: (projectId, noteId, data) => {
    return fetch(`${API_URL}/projects/${projectId}/notes/${noteId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  deleteNote: (projectId, noteId) => {
    return fetch(`${API_URL}/projects/${projectId}/notes/${noteId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },

  restoreRevision: (projectId, noteId, revisionVersion) => {
    return fetch(`${API_URL}/projects/${projectId}/notes/${noteId}/restore/${revisionVersion}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },
};

export const sessionService = {
  getSessions: (projectId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/projects/${projectId}/sessions${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },

  getSessionById: (projectId, sessionId) => {
    return fetch(`${API_URL}/projects/${projectId}/sessions/${sessionId}`, {
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },

  createSession: (projectId, data) => {
    return fetch(`${API_URL}/projects/${projectId}/sessions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  updateSession: (projectId, sessionId, data) => {
    return fetch(`${API_URL}/projects/${projectId}/sessions/${sessionId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  updateTimer: (projectId, sessionId, data) => {
    return fetch(`${API_URL}/projects/${projectId}/sessions/${sessionId}/timer`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  toggleGoal: (projectId, sessionId, goalId) => {
    return fetch(`${API_URL}/projects/${projectId}/sessions/${sessionId}/goals/${goalId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },

  joinSession: (projectId, sessionId) => {
    return fetch(`${API_URL}/projects/${projectId}/sessions/${sessionId}/join`, {
      method: 'POST',
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },

  deleteSession: (projectId, sessionId) => {
    return fetch(`${API_URL}/projects/${projectId}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).then(handleResponse);
  },
};




