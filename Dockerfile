FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./

RUN npm install --omit=dev

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3020

COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/data

EXPOSE 3020

CMD [ "node", "index.js" ]
