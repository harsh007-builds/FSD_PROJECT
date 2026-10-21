# ==========================================
# Phase 2: Backend Production Dockerfile
# Lean multi-stage build with non-root user
# ==========================================

# Stage 1: Dependencies installation
FROM node:20-alpine AS deps

WORKDIR /app

# Copy dependency specifications
COPY package.json package-lock.json ./

# Install only production dependencies for minimal image footprint
RUN npm ci --omit=dev && npm cache clean --force

# Stage 2: Production runtime
FROM node:20-alpine AS runner

WORKDIR /app

# Production environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy backend application source and package definition
COPY package.json ./
COPY src/ ./src/

# Create uploads directory and assign ownership to non-root node user
RUN mkdir -p /app/uploads && chown -R node:node /app

# Run as non-root user for security hardening
USER node

# Expose backend service port
EXPOSE 5000

# Start backend using production entry point
CMD ["node", "src/index.js"]
