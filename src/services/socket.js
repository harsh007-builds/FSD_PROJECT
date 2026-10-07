import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:5000';

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
  }

  connect(token) {
    if (!this.socket) {
      this.socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'], // Fallback options
      });

      this.socket.on('connect', () => {
        this.connected = true;
        console.log('Connected to real-time server');
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
        console.log('Disconnected from real-time server');
      });

      this.socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
      });
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  joinProject(projectId) {
    if (this.socket && projectId) {
      this.socket.emit('join_project', projectId);
    }
  }

  leaveProject(projectId) {
    if (this.socket && projectId) {
      this.socket.emit('leave_project', projectId);
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }
}

export const socketService = new SocketService();
