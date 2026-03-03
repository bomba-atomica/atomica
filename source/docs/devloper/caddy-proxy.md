# Caddy HTTPS Reverse Proxy

## Why Caddy?

Some browser APIs (WebAuthn, SubtleCrypto, etc.) require a secure context (`https://`). During local development, Vite serves over plain HTTP, which blocks these APIs.

Caddy solves this cleanly:
- Auto-provisions locally-trusted TLS certificates via its own CA (no browser warnings)
- Runs as a single binary with no daemon or root required
- Proxies all three local services (webapp, Ethereum RPC, Aptos API) behind a single HTTPS port

## Installation

Download the binary directly — no package manager or system daemon needed:

```bash
curl -L https://github.com/caddyserver/caddy/releases/latest/download/caddy_linux_amd64.tar.gz | tar xz caddy
mv caddy ~/.local/bin/
```

## First-time Setup

Install Caddy's local CA into your system trust store (needed once, so browsers trust the cert):

```bash
caddy trust
```

## Running

From the `atomica-web/` directory:

```bash
caddy run --config Caddyfile
```

You must pass `--config Caddyfile` explicitly, otherwise Caddy falls back to the system default config which tries to bind port 80 and fails without root.

This starts Caddy in the foreground. Ctrl+C to stop. No daemon, no root.

## Services

Each service gets its own HTTPS port:

| HTTPS port | Upstream              |
|------------|-----------------------|
| `:5443`    | Vite webapp `:5173`   |
| `:18545`   | Ethereum RPC `:8545`  |
| `:18080`   | Aptos REST API `:8080` |

The `Caddyfile` lives at `atomica-web/Caddyfile`.

## Configuring the webapp to use HTTPS

Set these env vars before starting Vite so the webapp points to the HTTPS endpoints:

```bash
# .env.local
VITE_ETH_RPC_URL=https://localhost:18545
VITE_APTOS_URL=https://localhost:18080
```

Then open the webapp at `https://localhost:5443`.
