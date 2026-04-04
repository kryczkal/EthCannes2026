#!/bin/bash
# Run this on the DigitalOcean droplet:
#   ssh root@<DROPLET_IP>
#   git clone https://github.com/kryczkal/EthCannes2026.git
#   cd EthCannes2026/engine
#   bash setup-droplet.sh

set -e

echo "=== Installing Node.js 22 ==="
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo "=== Installing dependencies ==="
npm install

echo "=== Pulling sandbox Docker image ==="
docker pull node:22-slim

echo "=== Creating .env ==="
cat > .env << 'ENVEOF'
# Required
ANTHROPIC_API_KEY=sk-ant-REPLACE_ME

# Payment verification (0G Galileo Testnet)
NPMGUARD_CONTRACT_ADDRESS=0x1201448ae5f00e1783036439569e71ab3757d0de
NPMGUARD_OG_RPC_URL=https://evmrpc-testnet.0g.ai

# Server
NPMGUARD_API_HOST=0.0.0.0
NPMGUARD_API_PORT=8000

# Investigation (set to false to skip Docker sandbox)
# NPMGUARD_INVESTIGATION_ENABLED=true
ENVEOF

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit .env and set ANTHROPIC_API_KEY"
echo "     nano .env"
echo ""
echo "  2. Start the engine"
echo "     npx tsx src/index.ts"
echo ""
echo "  Engine will be available at http://<DROPLET_IP>:8000"
echo "  Test: curl http://localhost:8000/health"
