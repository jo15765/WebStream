# Build stage — webpack client bundle
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime — Express serves API + static dist
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data /app/recordings
VOLUME ["/app/data", "/app/recordings"]
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server/index.js"]
