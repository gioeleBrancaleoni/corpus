# Optional container build. The primary supported path is bare `npm` (see README).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./

# Inside a container we must bind on all interfaces; publish the port only
# where you want it (compose maps it to 127.0.0.1 by default).
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
VOLUME /app/data
CMD ["npm", "start"]
