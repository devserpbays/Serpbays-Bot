#!/bin/bash
# Deploy script for bot-serp
# Usage: ./deploy.sh

set -euo pipefail

APP_DIR="/var/www/ai-bot/bot-serp"
LOG_FILE="/var/log/bot-serp-deploy.log"
HEALTH_URL="http://127.0.0.1:3005/api/health"
MAX_RETRIES=3

log() {
    echo "[$(date)] $1" | tee -a "$LOG_FILE"
}

log "=== Deploy started ==="

cd "$APP_DIR"

# 1. Pull latest code
log "Pulling latest code..."
git pull origin main 2>&1 | tee -a "$LOG_FILE"

# 2. Install deps only if package-lock changed
if git diff HEAD~1 --name-only | grep -q "package-lock.json"; then
    log "package-lock.json changed — running npm ci..."
    npm ci 2>&1 | tee -a "$LOG_FILE"
else
    log "No dependency changes, skipping npm ci"
fi

# 3. Build
log "Building..."
npm run build 2>&1 | tee -a "$LOG_FILE"

# 4. Restart app
log "Restarting bot-serp..."
pm2 restart bot-serp 2>&1 | tee -a "$LOG_FILE"

# 5. Health check with retries
log "Running health check..."
for i in $(seq 1 $MAX_RETRIES); do
    sleep 3
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "000")
    if [ "$http_code" = "200" ]; then
        log "Health check passed (attempt $i)"
        break
    fi
    if [ "$i" -eq "$MAX_RETRIES" ]; then
        log "ERROR: Health check failed after $MAX_RETRIES attempts (last: HTTP $http_code)"
        exit 1
    fi
    log "Health check attempt $i failed (HTTP $http_code), retrying..."
done

# 6. Restart worker
log "Restarting bot-serp-worker..."
pm2 restart bot-serp-worker 2>&1 | tee -a "$LOG_FILE"

log "=== Deploy completed successfully ==="
