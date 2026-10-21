# StudySync — Full-Stack Real-Time Academic Collaboration Platform

StudySync is a modern full-stack collaborative platform featuring real-time project workspaces, kanban task boards, interactive study sessions, resource sharing, and instant messaging.

---

## 🏗️ Architecture Overview

The application is fully containerized using a multi-stage Docker architecture coordinated with Docker Compose:

```
                                  ┌──────────────────────────────┐
                                  │       Client Browser         │
                                  └──────────────┬───────────────┘
                                                 │
                                                 │ HTTP / WebSocket (:3000)
                                                 ▼
               ┌─────────────────────────────────────────────────────────────────┐
               │              Frontend Container (studysync-frontend)            │
               │                                                                 │
               │  ┌───────────────────────┐          ┌─────────────────────────┐ │
               │  │ Nginx Reverse Proxy   │──/api───▶│ React 19 SPA (Vite 8)   │ │
               │  │  (Port 80 -> Host 3000)│──/socket─▶│ Static Assets (/dist)   │ │
               │  └───────────┬───────────┘          └─────────────────────────┘ │
               └──────────────┼──────────────────────────────────────────────────┘
                              │
               Docker Bridge  │ Private Network (studysync-network)
                              ▼
┌───────────────────────────────────────────────┐     ┌─────────────────────────────────┐
│     Backend Container (studysync-backend)     │     │  Database (studysync-mongodb)   │
│                                               │     │                                 │
│  • Express 5 REST API (:5000)                 │────▶│  • MongoDB 7.0 (:27017)         │
│  • Socket.IO 4.8 Real-Time Engine             │     │  • Persistent Volume            │
│  • Security-Hardened Non-Root (`USER node`)   │     │    (`studysync_mongo_data`)     │
└───────────────────────────────────────────────┘     └─────────────────────────────────┘
```

---

## 📋 Prerequisites

Before running the containerized application, ensure you have:
- [Docker Engine](https://docs.docker.com/engine/install/) (v24.0+ recommended)
- [Docker Compose](https://docs.docker.com/compose/) (v2.20+ or Docker Compose v5)
- Git

---

## 🔐 Environment Variables

The application is pre-configured with safe production defaults for local Docker execution. You can override any value at runtime or via a `.env` file in the repository root:

| Variable | Description | Default in Compose | Required |
| :--- | :--- | :--- | :--- |
| `PORT` | Port for the backend Express server | `5000` | No |
| `NODE_ENV` | Runtime environment mode | `production` | No |
| `MONGODB_URI` | Connection string for MongoDB (local container or Atlas) | `mongodb://mongodb:27017/studysync` | No |
| `JWT_SECRET` | Secret key used for signing JWT authentication tokens | *Auto-generated default* | Recommended for prod |
| `FRONTEND_URL` | Allowed CORS origins (supports comma-separated values) | `http://localhost:3000,http://localhost:5173` | No |
| `VITE_API_URL` | Frontend API base URL (baked into Nginx build as relative path) | `/api` | No |
| `VITE_SOCKET_URL` | Frontend Socket.IO server address | `/` | No |

> ⚠️ **Security Notice:** Never commit actual passwords, private secrets, or production MongoDB Atlas connection strings to source control.

---

## 🚀 Quick Start (Docker Compose)

### 1. Build and Start the Entire Application Stack
To build the images and launch all containers in detached mode:
```bash
docker compose up -d --build
```

### 2. Verify Container Status & Health
```bash
docker compose ps
```
You should see all three services reporting `(healthy)`:
- `studysync-frontend` — Port `3000`
- `studysync-backend` — Port `5000`
- `studysync-mongodb` — Port `27017`

### 3. Access the Application
- **Frontend Web UI:** [http://localhost:3000](http://localhost:3000)
- **Backend API Direct:** [http://localhost:5000/api](http://localhost:5000/api)
- **Backend Health Endpoint:** [http://localhost:5000/api/health](http://localhost:5000/api/health)
- **Proxied API via Nginx:** [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## 🛑 Managing Containers

### Stop Containers (Preserve Data)
```bash
docker compose stop
```

### Stop and Remove Containers (Preserve Data)
```bash
docker compose down
```

### Stop and Wipe All Persistent Data
```bash
docker compose down -v
```

---

## 📜 Viewing Logs

View interleaved logs from all running containers:
```bash
docker compose logs -f
```

View logs from a specific service:
```bash
# Frontend (Nginx access and error logs)
docker compose logs -f frontend

# Backend (Express request and Socket.IO logs)
docker compose logs -f backend

# MongoDB (Database engine logs)
docker compose logs -f mongodb
```

---

## 🔄 Rebuilding After Code Changes

When you modify frontend React code or backend Node.js files, rebuild the images with:
```bash
# Rebuild and restart both services
docker compose up -d --build

# Rebuild only the frontend after UI changes
docker compose up -d --build frontend

# Rebuild only the backend after API changes
docker compose up -d --build backend
```

---

## 💾 Database Configuration

### Option A: Local Containerized MongoDB (Default)
Out of the box, `compose.yaml` launches an official MongoDB 7.0 container configured with a named Docker volume (`studysync_mongo_data`). All user accounts, projects, tasks, and discussions persist across container restarts.

### Option B: MongoDB Atlas (External Cloud Database)
To use MongoDB Atlas instead of the local container:
1. Ensure your Atlas cluster's Network Access allows connections from your IP (or `0.0.0.0/0` for cloud deployment).
2. Create a `.env` file in the repository root (ignored by `.gitignore`):
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/studysync?retryWrites=true&w=majority
   ```
3. Run `docker compose up -d backend frontend`. The backend will automatically detect `MONGODB_URI` and connect to Atlas.

---

## 🧪 CI/CD Pipeline Integration

The repository includes an automated GitHub Actions workflow (`.github/workflows/ci.yml`) that validates the Docker configuration on every push and pull request to `main`:
- Validates the Docker Compose file (`docker compose config`)
- Builds the production backend Docker image (`studysync-backend:ci`)
- Builds the production frontend Docker image (`studysync-frontend:ci`)
- Fails the build pipeline if any syntax errors or build issues occur.

---

## 🔧 Troubleshooting

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| `Port 3000 or 5000 is already in use` | Another process is listening on the host port | Stop conflicting local dev servers (`npm run dev`) or change the host port in `compose.yaml` (e.g. `"3001:80"`). |
| `Cannot connect to Docker daemon` | Docker Desktop is not running | Start Docker Desktop and ensure the engine has finished booting. |
| SPA 404 error when refreshing page | Web server is not configured for client-side routing | Verified fixed: `nginx.conf` has `try_files $uri $uri/ /index.html;` configured. |
| API returns `401 Unauthorized` | Missing or expired JWT token | Log in via `/login` or obtain a token via `POST /api/auth/login`. |
| Container shows `unhealthy` | Service still starting up | Check container logs with `docker compose logs <service>`. Wait for start period (10-20s) to complete. |
