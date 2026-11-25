FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
COPY public ./public
RUN mkdir /data && chown node:node /data
ENV NODE_ENV=production DATA_FILE=/data/state.json
USER node
EXPOSE 3000
CMD ["node", "server.js"]
