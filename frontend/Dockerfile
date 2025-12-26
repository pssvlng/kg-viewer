# Multi-stage build for Angular application
FROM node:18-alpine as build

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build arguments for configuration
ARG BUILD_TIME
ARG API_BASE_URL=http://localhost:5000
ARG LODVIEW_URL=http://localhost:8080
ARG VIRTUOSO_URL=http://localhost:8890
ARG GRAPH_BASE_URI=http://example.org/graph

ENV BUILD_TIME=${BUILD_TIME}

# Build the Angular application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built Angular app
COPY --from=build /app/dist/kg-viewer-frontend /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Add timestamp info for debugging
RUN echo "Build time: ${BUILD_TIME}" > /usr/share/nginx/html/build-info.txt

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]