#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  ScriptSync Pro — One-Command Setup                     ${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════${NC}"
echo ""

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# ─── Check prerequisites ───
echo -e "${YELLOW}Checking prerequisites...${NC}"

check_cmd() {
  if command -v "$1" &>/dev/null; then
    echo -e "  ✓ $1 found"
    return 0
  else
    echo -e "  ${RED}✗ $1 not found${NC}"
    return 1
  fi
}

MISSING=0
check_cmd node || MISSING=1
check_cmd npm || MISSING=1
check_cmd docker || MISSING=1

if [ $MISSING -eq 1 ]; then
  echo ""
  echo -e "${RED}Missing prerequisites. Please install:${NC}"
  echo "  - Node.js 20+: https://nodejs.org"
  echo "  - Docker Desktop: https://docker.com/products/docker-desktop"
  exit 1
fi

# Check Docker is running
if ! docker info &>/dev/null 2>&1; then
  echo -e "${RED}Docker is not running. Please start Docker Desktop first.${NC}"
  exit 1
fi
echo -e "  ✓ Docker is running"

# Optional tools
echo ""
echo -e "${YELLOW}Optional tools (for local plugin use):${NC}"
check_cmd ffmpeg || echo -e "    ${YELLOW}→ Install: brew install ffmpeg${NC}"
# Whisper is optional — server-side transcription works without local binary

echo ""

# ─── Create .env from example ───
echo -e "${YELLOW}Setting up environment...${NC}"
if [ ! -f server/.env ]; then
  # Generate random secrets
  ACCESS_SECRET=$(openssl rand -hex 32)
  REFRESH_SECRET=$(openssl rand -hex 32)

  cp server/.env.example server/.env
  sed -i '' "s|change-me-access-secret-min-32-chars|${ACCESS_SECRET}|" server/.env
  sed -i '' "s|change-me-refresh-secret-min-32-chars|${REFRESH_SECRET}|" server/.env
  # Fix DB URL for local Docker
  sed -i '' "s|postgresql://postgres:postgres@localhost:5432/scriptsync|postgresql://scriptsync:scriptsync_dev@localhost:5432/scriptsync|" server/.env
  echo -e "  ✓ Created server/.env with generated secrets"
else
  echo -e "  ✓ server/.env already exists"
fi

# ─── Start Postgres + Redis via Docker ───
echo ""
echo -e "${YELLOW}Starting Postgres + Redis...${NC}"
docker compose up -d postgres redis
echo -e "  ✓ Databases starting"

# Wait for Postgres to be ready
echo -e "  Waiting for Postgres..."
for i in {1..30}; do
  if docker compose exec -T postgres pg_isready -U scriptsync &>/dev/null 2>&1; then
    echo -e "  ✓ Postgres is ready"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${RED}  Postgres failed to start after 30s${NC}"
    exit 1
  fi
  sleep 1
done

# ─── Install dependencies ───
echo ""
echo -e "${YELLOW}Installing server dependencies...${NC}"
cd "$PROJECT_DIR/server"
npm install 2>&1 | tail -1
echo -e "  ✓ Server dependencies installed"

echo ""
echo -e "${YELLOW}Installing portal dependencies...${NC}"
cd "$PROJECT_DIR/portal"
npm install 2>&1 | tail -1
echo -e "  ✓ Portal dependencies installed"

echo ""
echo -e "${YELLOW}Installing helper dependencies...${NC}"
cd "$PROJECT_DIR/plugin/helper"
npm install 2>&1 | tail -1
echo -e "  ✓ Helper dependencies installed"

# ─── Run Prisma migrations ───
echo ""
echo -e "${YELLOW}Running database migrations...${NC}"
cd "$PROJECT_DIR/server"
npx prisma generate 2>&1 | tail -1
npx prisma db push --accept-data-loss 2>&1 | tail -3
echo -e "  ✓ Database schema applied"

# ─── Seed the database ───
echo ""
echo -e "${YELLOW}Seeding database with demo data...${NC}"
node prisma/seed.js 2>&1 || echo -e "  ${YELLOW}(Seed may have already run)${NC}"
echo -e "  ✓ Demo data ready"

# ─── Create local storage directory ───
mkdir -p "$PROJECT_DIR/server/storage"

# ─── Print summary ───
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup complete! Here's how to run everything:          ${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Terminal 1 — Server:${NC}"
echo "  cd server && npm run dev"
echo ""
echo -e "${BLUE}Terminal 2 — Portal:${NC}"
echo "  cd portal && npm run dev"
echo ""
echo -e "${BLUE}Terminal 3 — Helper (optional, for local transcription):${NC}"
echo "  cd plugin/helper && npm start"
echo ""
echo -e "${YELLOW}Demo login:${NC}"
echo "  Email:    admin@scriptsyncpro.com"
echo "  Password: password123"
echo ""
echo -e "${YELLOW}URLs:${NC}"
echo "  Portal:      http://localhost:5173"
echo "  Server API:  http://localhost:3000"
echo "  Health:      http://localhost:3000/health"
echo ""
echo -e "${YELLOW}To add your Anthropic API key (for screenplay parsing):${NC}"
echo "  Edit server/.env → set ANTHROPIC_API_KEY=sk-ant-..."
echo ""
echo -e "${YELLOW}To set up Cloudflare R2 (for remote clip storage):${NC}"
echo "  1. Create a bucket at dash.cloudflare.com → R2"
echo "  2. Create an API token with R2 read/write"
echo "  3. Edit server/.env → fill in R2_* variables"
echo "  (Without R2, clips are stored locally in server/storage/)"
echo ""
