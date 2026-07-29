# Dockerfile for Shadow Hunt Multiplayer Server
FROM node:20-alpine

WORKDIR /app

# Copy package files and source
COPY package.json ./
COPY server.js ./
COPY server/ ./server/
COPY public/ ./public/

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
