FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV PORT=3000
HEALTHCHECK --interval=30s --timeout=2s --retries=3 CMD wget -qO- http://localhost:$PORT/health || exit 1
EXPOSE 3000
CMD ["npm","start"]
