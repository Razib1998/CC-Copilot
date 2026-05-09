FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY pdf-checks.js ./
COPY server.js ./
RUN chown -R node:node /app

USER node

ENV PORT=3030
EXPOSE 3030

CMD ["node", "server.js"]
