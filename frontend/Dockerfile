FROM nginx:alpine

# Add a build timestamp to force rebuilds
ARG BUILD_TIME
ENV BUILD_TIME=${BUILD_TIME}

# Copy static files
COPY src/index.html /usr/share/nginx/html/
COPY src/app.js /usr/share/nginx/html/

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Add timestamp info for debugging
RUN echo "Build time: ${BUILD_TIME}" > /usr/share/nginx/html/build-info.txt

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]