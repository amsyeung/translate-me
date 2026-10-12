# translate me — shared voice server

A tiny proxy that lets every user of the extension hear Microsoft's neural voices (including Cantonese) through one **Azure Speech free-tier (F0)** key, without the key ever leaving the server.

```
extension (background) ──HTTPS──▶ tts.aoricreative.com (Cloudflare)
                                     │  Cloudflare Tunnel (outbound connection only)
                                Oracle VM ─ docker compose
                                  ├─ cloudflared
                                  └─ tts-proxy (Node 22, no dependencies)
                                       ├─ only the extension's origin, ≤300 characters per request
                                       ├─ per-IP limits, daily and monthly character caps
                                       ├─ disk cache: repeated phrases never reach Azure again
                                       └─ Azure F0: at most 18 requests per minute (F0 allows 20)
```

**Privacy.** Only audio is cached (keyed by a hash). Text and IP addresses are never logged or stored.

## API

| | |
| --- | --- |
| `POST /v1/tts` | Body `{ "text", "locales": ["zh-HK", "zh-TW"], "voice"?, "rate"?, "pitch"? }`. Returns `audio/mpeg`. `X-Cache: HIT/MISS` tells you whether Azure was called. |
| `GET /v1/voices?locales=zh-HK,zh-TW` | Neural voices for those locales. |
| `GET /health` | Status, today's and this month's character usage, cache size. |

**Errors.** Errors are JSON `{ error, message }`:
- `403`: wrong origin
- `413`: text too long
- `429`: per-IP limit or character budget reached
- `503`: Azure is busy

The extension falls back to the browser voice on any of these.

## Deploy (one time, about 20 minutes)

### 1. Azure Speech, free tier

1. In the [Azure portal](https://portal.azure.com), *Create a resource* → **Speech** (Azure AI services).
2. Choose:
   - Region **East Asia** (Hong Kong), or one close to your users
   - Pricing tier **Free F0**
   
   Each subscription can have only one F0 Speech resource.
3. Open the resource → *Keys and Endpoint* → copy **Key 1** and the **Location/Region** (e.g. `eastasia`).

The F0 tier can't be billed. When it runs out it simply stops for the rest of the month, and the extension then uses browser voices.

### 2. Cloudflare Tunnel

`aoricreative.com` is already on Cloudflare.

1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com) → *Networks* → *Tunnels* → **Create a tunnel** → *Cloudflared*, and name it `translate-me-tts`.
2. On the *Install connector* step, choose **Docker** and copy only the **token** (the long string after `--token`).
3. Under **Public hostname**, add:
   - Subdomain `tts`, domain `aoricreative.com`
   - Service **HTTP** → `tts-proxy:8080`
   
   `tts-proxy:8080` is the container name inside docker compose.

Cloudflare creates the DNS record and the HTTPS certificate automatically, and you don't need to open any port on Oracle.

### 3. Oracle VM

SSH in. The steps are the same on Ubuntu, x86 or ARM.

```bash
# Docker (skip if already installed)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# Get the code and configure
git clone https://github.com/amsyeung/translate-me.git
cd translate-me/server/tts-proxy
cp .env.example .env
nano .env        # fill AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, CLOUDFLARE_TUNNEL_TOKEN
chmod 600 .env

docker compose up -d --build
docker compose logs -f tts-proxy     # expect: tts-proxy listening on :8080
```

Both containers together use roughly 100–150 MB of RAM, so they fit next to your Telegram job on a 1 GB micro VM.

### 4. Check it

```bash
curl https://tts.aoricreative.com/health
# {"ok":true,"budget":{...},...}

curl -s -o /dev/null -w '%{http_code}\n' -X POST https://tts.aoricreative.com/v1/tts
# 403 (wrong origin): the server is up and rejecting strangers
```

Then, in the extension, go to *Settings → Voice*, choose **translate me natural voices (free)** and press **▶ Test**.

**Testing an unpacked build:** its ID is different from the store's. Add it to `ALLOWED_ORIGINS` (comma-separated) and run `docker compose up -d` again.

## Operating it

| Task | Command |
| --- | --- |
| Update after a `git pull` | `docker compose up -d --build` |
| Logs (no text, no IPs) | `docker compose logs --tail 100 tts-proxy` |
| Usage this month | `curl https://tts.aoricreative.com/health` |
| Stop | `docker compose down` (the cache and usage counters live in the `tts-data` volume) |

All limits can be tuned in `.env` (see `.env.example`). The defaults keep you within F0:
- **Monthly:** 450,000 characters (F0 allows about 500,000)
- **Daily:** 15,000 characters, so one busy day can't use up the whole month
- **Per IP:** 20 requests per minute, 400 per day

**Optional extra protection:** in Cloudflare → *Security* → *WAF*, add a rate-limiting rule for `tts.aoricreative.com/v1/*`.

## Development

```bash
node --test "test/*.mjs"     # 18 tests, using a fake Azure server
```
