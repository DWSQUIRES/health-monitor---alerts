# Health Monitor & Alerts

Minimal ops monitor: check debt + health, list non‑zero collateral.

## Configure & Run

```bash
cp .env.example .env
RPC_URL=http://127.0.0.1:8545
COMET_ADDRESS=0xc3d688B66703497DAA19211EEdff47f25384cdc3

npm install
npm run build
node dist/index.js -a 0x0000000000000000000000000000000000000000
```

Watch mode (poll every 10s):
```bash
node dist/index.js -a 0x... -w -i 10
```

Use this as a backend for Slack/Telegram alerting. 