FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
ENV NODE_ENV=production
EXPOSE 8081
CMD ["node", "server/index.mjs"]
