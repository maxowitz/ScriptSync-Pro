#!/bin/bash
# ScriptSync Pro — Plugin Installer for Adobe Premiere Pro
# Run: curl -sL https://raw.githubusercontent.com/maxowitz/ScriptSync-Pro/main/install-plugin.sh | bash

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PLUGIN_DIR="/Library/Application Support/Adobe/UXP/Plugins/External/com.scriptsyncpro.plugin"
REPO_URL="https://github.com/maxowitz/ScriptSync-Pro"
TMP_DIR=$(mktemp -d)

echo ""
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  ScriptSync Pro — Plugin Installer               ${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo ""

# Check for Premiere Pro
if [ ! -d "/Applications/Adobe Premiere Pro"* ]; then
  echo -e "${RED}Adobe Premiere Pro not found in /Applications.${NC}"
  echo "Please install Premiere Pro first."
  exit 1
fi
echo -e "${GREEN}✓${NC} Adobe Premiere Pro found"

# Download plugin
echo -e "${YELLOW}Downloading ScriptSync Pro plugin...${NC}"
curl -sL "${REPO_URL}/archive/refs/heads/main.tar.gz" -o "$TMP_DIR/repo.tar.gz"
tar -xzf "$TMP_DIR/repo.tar.gz" -C "$TMP_DIR"
echo -e "${GREEN}✓${NC} Downloaded"

# Install (requires sudo for system directory)
echo -e "${YELLOW}Installing plugin (admin password may be required)...${NC}"
sudo mkdir -p "/Library/Application Support/Adobe/UXP/Plugins/External"
sudo rm -rf "$PLUGIN_DIR"
sudo cp -R "$TMP_DIR/ScriptSync-Pro-main/plugin" "$PLUGIN_DIR"
echo -e "${GREEN}✓${NC} Plugin installed"

# Enable developer mode if not already
DEV_SETTINGS="/Library/Application Support/Adobe/UXP/Developer/settings.json"
if [ ! -f "$DEV_SETTINGS" ]; then
  sudo mkdir -p "/Library/Application Support/Adobe/UXP/Developer"
  echo '{"developer" : true}' | sudo tee "$DEV_SETTINGS" > /dev/null
  echo -e "${GREEN}✓${NC} Developer mode enabled"
fi

# Cleanup
rm -rf "$TMP_DIR"

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Installation complete!                          ${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. Restart Adobe Premiere Pro (close and reopen)"
echo "  2. Go to Window > Extensions > ScriptSync Pro"
echo "  3. Log in with your ScriptSync Pro account"
echo ""
echo -e "Server: ${BLUE}https://server-production-4168.up.railway.app${NC}"
echo -e "Portal: ${BLUE}https://portal-production-ef0a.up.railway.app${NC}"
echo ""
