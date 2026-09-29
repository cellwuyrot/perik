FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.mjs seed.mjs README.md .env.example ./
COPY public ./public
COPY data ./data
RUN mkdir -p /app/data
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node","server.mjs"]
