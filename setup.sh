#!/bin/bash
set -e

# ── GetMention — Local Setup Script ──────────────────────
# Run this once to set up the app on a new machine.
# Usage: chmod +x setup.sh && ./setup.sh

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║   GetMention — Local Setup            ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

# ── Check Node.js ──
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not found. Install Node.js 18+ first: https://nodejs.org${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗ Node.js 18+ required (found v$(node -v))${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# ── Check npm ──
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v)${NC}"

# ── Check/Install MongoDB ──
if command -v mongosh &> /dev/null || command -v mongod &> /dev/null; then
    echo -e "${GREEN}✓ MongoDB installed${NC}"
elif command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠ MongoDB not installed locally — use 'docker compose up mongodb' or install MongoDB${NC}"
else
    echo -e "${YELLOW}⚠ MongoDB not found. Install it: https://www.mongodb.com/docs/manual/installation/${NC}"
fi

# ── Check/Install Redis ──
if command -v redis-cli &> /dev/null; then
    echo -e "${GREEN}✓ Redis installed${NC}"
elif command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠ Redis not installed locally — use 'docker compose up redis' or install Redis${NC}"
else
    echo -e "${YELLOW}⚠ Redis not found. Install it: https://redis.io/docs/getting-started/${NC}"
fi

# ── Setup .env.local ──
if [ ! -f .env.local ]; then
    if [ -f .env.example ]; then
        cp .env.example .env.local
        echo -e "${YELLOW}⚠ Created .env.local from .env.example — edit it with your API keys${NC}"
    else
        echo -e "${RED}✗ No .env.example found${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ .env.local exists${NC}"
fi

# ── Secure .env.local permissions ──
chmod 600 .env.local
echo -e "${GREEN}✓ .env.local permissions set to 600${NC}"

# ── Install dependencies ──
echo ""
echo "Installing dependencies..."
npm ci
echo -e "${GREEN}✓ Dependencies installed${NC}"

# ── Install Playwright browsers ──
echo ""
echo "Installing Playwright browsers..."
npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium
echo -e "${GREEN}✓ Playwright Chromium installed${NC}"

# ── Build ──
echo ""
echo "Building Next.js app..."
npm run build
echo -e "${GREEN}✓ Build complete${NC}"

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║   Setup Complete!                     ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""
echo "  Before starting, edit .env.local with your:"
echo "    • Clerk API keys"
echo "    • PayPal credentials (optional)"
echo "    • OpenClaw AI gateway details"
echo ""
echo "  Start options:"
echo ""
echo "  1. Development mode:"
echo "     npm run dev"
echo ""
echo "  2. Production mode (local):"
echo "     npm start"
echo ""
echo "  3. Production + Worker (PM2):"
echo "     npm install -g pm2"
echo "     pm2 start ecosystem.config.js"
echo ""
echo "  4. Docker (everything included):"
echo "     docker compose up -d"
echo ""
echo "  App will be at: http://localhost:3005"
echo ""
