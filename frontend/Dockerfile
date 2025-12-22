FROM nginx:alpine

# Build arguments for configuration
ARG BUILD_TIME
ARG API_BASE_URL=http://localhost:5000
ARG LODVIEW_URL=http://localhost:8080
ARG VIRTUOSO_URL=http://localhost:8890
ARG GRAPH_BASE_URI=http://example.org/graph

ENV BUILD_TIME=${BUILD_TIME}

# Copy static files
COPY src/index.html /usr/share/nginx/html/
COPY src/app.js /usr/share/nginx/html/
COPY src/config.js /usr/share/nginx/html/

# Inject build-time configuration
RUN sed -i "s|API_BASE_URL: 'http://localhost:5000'|API_BASE_URL: '${API_BASE_URL}'|g" /usr/share/nginx/html/config.js && \
    sed -i "s|LODVIEW_URL: 'http://localhost:8080'|LODVIEW_URL: '${LODVIEW_URL}'|g" /usr/share/nginx/html/config.js && \
    sed -i "s|VIRTUOSO_URL: 'http://localhost:8890'|VIRTUOSO_URL: '${VIRTUOSO_URL}'|g" /usr/share/nginx/html/config.js && \
    sed -i "s|GRAPH_BASE_URI: 'http://example.org/graph'|GRAPH_BASE_URI: '${GRAPH_BASE_URI}'|g" /usr/share/nginx/html/config.js

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Add timestamp info for debugging
RUN echo "Build time: ${BUILD_TIME}" > /usr/share/nginx/html/build-info.txt

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]