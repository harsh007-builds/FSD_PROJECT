require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');

// Verify models compile
const Project = require('./models/Project');
const Task = require('./models/Task');
console.log('Mongoose Models successfully imported:', { Project: !!Project, Task: !!Task });

// Connect to Database
connectDB();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' 
    ? 'https://your-production-domain.com' 
    : 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json());
app.use(morgan('dev')); // Request logging

// Routes
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const activityRoutes = require('./routes/activityRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const invitationRoutes = require('./routes/invitationRoutes');
const searchRoutes = require('./routes/searchRoutes');

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/search', searchRoutes);

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);


const http = require('http');
const { init } = require('./socket');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Initialize Socket.io
init(server);

server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
