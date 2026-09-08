FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000

# Las migraciones se ejecutan de forma explícita, después de revisar y respaldar la BD.
CMD ["node", "dist/index.js"]

