#!/bin/bash
# Start all ScriptSync Pro services in background
# Usage: ./start-all.sh

set -e
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Starting ScriptSync Pro...${NC}"

# Ensure Docker services are up
docker compose up -d postgres redis 2>/dev/null

# Start server
echo -e "  Starting server on :3000..."
cd "$PROJECT_DIR/server"
npx nodemon src/index.js &
SERVER_PID=$!

# Start portal
echo -e "  Starting portal on :5173..."
cd "$PROJECT_DIR/portal"
npx vite --host &
PORTAL_PID=$!

# Start helper
echo -e "  Starting helper on :9876..."
cd "$PROJECT_DIR/plugin/helper"
node index.js &
HELPER_PID=$!

echo ""
echo -e "${GREEN}All services running:${NC}"
echo "  Portal:  http://localhost:5173"
echo "  Server:  http://localhost:3000"
echo "  Helper:  http://localhost:9876"
echo ""
echo "Press Ctrl+C to stop all services"

# Trap Ctrl+C to kill all
trap "echo 'Stopping...'; kill $SERVER_PID $PORTAL_PID $HELPER_PID 2>/dev/null; exit 0" SIGINT SIGTERM

wait
