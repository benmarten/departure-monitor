# Builder stage
FROM oven/bun:1 AS builder

# Accept build arguments for environment variables
ARG EXPO_PUBLIC_ENV
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_BASE_URL
ARG EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID

# Set environment variables for the build
ENV EXPO_PUBLIC_ENV=${EXPO_PUBLIC_ENV}
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}
ENV EXPO_PUBLIC_BASE_URL=${EXPO_PUBLIC_BASE_URL}
ENV EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=${EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID}

# Debug: Print environment variables
RUN echo "=== DOKKU DEBUG START ===" && \
    echo "Build environment variables:" && \
    echo "EXPO_PUBLIC_ENV=$EXPO_PUBLIC_ENV" && \
    echo "EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL" && \
    echo "EXPO_PUBLIC_BASE_URL=$EXPO_PUBLIC_BASE_URL" && \
    echo "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=$EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID" && \
    env | grep EXPO_PUBLIC || echo "No EXPO_PUBLIC vars found in env" && \
    echo "=== DOKKU DEBUG END ==="

WORKDIR /app
COPY package.json bun.lock ./
# Install all dependencies (including dev) for Expo build
RUN bun install --frozen-lockfile
COPY . .
RUN echo "=== EXPO BUILD DEBUG START ===" && \
    env | grep EXPO_PUBLIC && \
    echo "=== EXPO BUILD DEBUG END ===" && \
    bunx expo export --platform web

# Production stage
FROM oven/bun:1-alpine AS production
RUN bun add -g serve
WORKDIR /app
COPY --from=builder /app/dist ./dist
CMD ["serve", "-s", "dist", "-l", "5000"]