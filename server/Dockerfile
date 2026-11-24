FROM node:22-alpine

# ffmpeg is used for thumbnails and video length; everything else is plain Node.
RUN apk add --no-cache ffmpeg \
 && mkdir -p /data && chown node:node /data

WORKDIR /app
COPY package.json server.js ./
COPY public ./public

ENV NODE_ENV=production DATA_DIR=/data PORT=8080
USER node
EXPOSE 8080
VOLUME /data

HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
