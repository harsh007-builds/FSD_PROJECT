const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Project = require('./models/Project');

let io;

const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' 
        ? 'https://your-production-domain.com' 
        : 'http://localhost:5173'),
      credentials: true,
    }
  });

  // Socket Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected to socket: ${socket.user._id}`);

    // Join project room
    socket.on('join_project', async (projectId) => {
      try {
        // Verify user is authorized for project
        const project = await Project.findById(projectId);
        if (!project) return;
        
        const isAuth = project.owner.toString() === socket.user._id.toString() || project.members.includes(socket.user._id);
        if (isAuth) {
          socket.join(`project_${projectId}`);
          console.log(`User ${socket.user._id} joined room project_${projectId}`);
        } else {
          console.log(`User ${socket.user._id} not authorized for project_${projectId}`);
        }
      } catch (err) {
        console.error('Error joining project room:', err);
      }
    });

    // Leave project room
    socket.on('leave_project', (projectId) => {
      socket.leave(`project_${projectId}`);
      console.log(`User ${socket.user._id} left room project_${projectId}`);
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected from socket: ${socket.user._id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

module.exports = { init, getIO };
