FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "node -e \"console.log('--- Env Keys Diagnostic ---', Object.keys(process.env))\" && npx tsx prisma/fix-failed-migrations.ts && npx prisma migrate deploy && npm run start"]

