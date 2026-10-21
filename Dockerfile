# ==========================================
# Phase 2: Frontend Production Dockerfile
# Multi-stage build for React/Vite + Nginx
# ==========================================

# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install dependencies reproducibly
RUN npm ci

# Build arguments for Vite environment variables
ARG VITE_API_URL=/api
ARG VITE_SOCKET_URL=/
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

# Copy frontend source code and configurations
COPY index.html ./
COPY vite.config.js ./
COPY postcss.config.js ./
COPY tailwind.config.js* ./
COPY public/ ./public/
COPY src/ ./src/

# Build static production bundle into dist/
RUN npm run build

# Stage 2: Production web server
FROM nginx:alpine AS runner

# Remove default nginx static files
RUN rm -rf /usr/share/nginx/html/*

# Copy built production assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration with SPA fallback & reverse proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Document and expose port 80
EXPOSE 80

# Start Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
