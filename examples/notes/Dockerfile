# The notes example App: one container, one data volume.
# Build from the repository root:
#   docker build -f examples/notes/Dockerfile -t open-agent-kit-notes .
FROM node:22.22-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm cache clean --force
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node examples ./examples
RUN node examples/notes/build.mjs
ENV HOST=0.0.0.0 PORT=3120 DATA_DIR=/data NODE_ENV=production
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3120
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3120) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["npx", "tsx", "examples/notes/app.ts"]
