FROM node:20-alpine

# git: branch listing/creation for tickets (see src/utils/git.js)
RUN apk add --no-cache git

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV PORT=5000
EXPOSE 5000

CMD ["node", "src/server.js"]
