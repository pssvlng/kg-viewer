# Multi-stage build for Angular application
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies using npm ci for faster, more reliable builds
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build the Angular application for production
RUN npm run build

# Production stage — minimal nginx image
FROM nginx:1.27-alpine

# Run nginx as non-root
RUN addgroup -g 1001 -S nginx-app && adduser -u 1001 -S nginx-app -G nginx-app \
    && chown -R nginx-app:nginx-app /usr/share/nginx/html /var/cache/nginx \
    && touch /var/run/nginx.pid && chown nginx-app:nginx-app /var/run/nginx.pid

# Copy built Angular app
COPY --from=build /app/dist/kg-viewer-frontend /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]