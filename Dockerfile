# Stage 1: Build
FROM node:24-alpine AS build

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

# Stage 2: Runtime
FROM node:24-alpine

ENV NODE_ENV=production

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force && apk del python3 make g++

COPY --from=build /app/dist/ dist/
COPY config.yml ./

USER node

CMD ["node", "dist/index.js"]
