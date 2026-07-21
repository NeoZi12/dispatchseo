# The in-stack builder: headless Claude Code + git + gh, polling the app
# container for due jobs (daily guide, weekly research, tool builds,
# geo-scan) and executing them right next to the backend - the Docker
# replacement for the GitHub-Actions schedules, which cannot call back into
# a localhost instance. All scheduling brains live in the backend
# (/api/builder/jobs); this image is a dumb executor on purpose, so cadence
# and prompt changes never require rebuilding it.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates jq gnupg \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# corepack gives the agent pnpm/yarn shims for whatever stack the site repo
# uses when the instructions say "run the repo's build to verify".
RUN npm install -g @anthropic-ai/claude-code && corepack enable

COPY run.sh /usr/local/bin/run.sh

# Claude Code refuses permission-bypass as root, same as on CI runners -
# run as the image's unprivileged user, with all state on the /data volume.
RUN mkdir -p /data && chown -R node:node /data
USER node
ENV HOME=/data
WORKDIR /data

ENTRYPOINT ["/bin/sh", "/usr/local/bin/run.sh"]
