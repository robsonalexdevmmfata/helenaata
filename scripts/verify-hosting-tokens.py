"""Confere GitHub, Vercel e Cloudflare sem imprimir segredo."""
from pathlib import Path
import json
import ssl
import urllib.error
import urllib.request

root = Path(__file__).resolve().parents[1]
env = {}
for line in (root / ".env.local").read_text(encoding="utf-8").splitlines():
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, val = line.split("=", 1)
    env[key.strip()] = val.strip()

ctx = ssl.create_default_context()


def get(url: str, headers: dict) -> tuple[int, str]:
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=20) as res:
            return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode("utf-8", "replace")


status, body = get(
    "https://api.github.com/user",
    {
        "Authorization": "Bearer " + env["GITHUB_TOKEN"],
        "Accept": "application/vnd.github+json",
        "User-Agent": "helena",
        "X-GitHub-Api-Version": "2022-11-28",
    },
)
if status == 200:
    print("github ok", json.loads(body).get("login"))
else:
    print("github falhou", status)

status, body = get("https://api.vercel.com/v2/user", {"Authorization": "Bearer " + env["VERCEL_TOKEN"]})
if status == 200:
    data = json.loads(body)
    user = data.get("user") or data
    print("vercel ok", user.get("username") or "user")
else:
    print("vercel falhou", status)

team_id = env.get("VERCEL_TEAM_ID", "")
status, body = get(
    f"https://api.vercel.com/v2/teams/{team_id}",
    {"Authorization": "Bearer " + env["VERCEL_TOKEN"]},
)
if status == 200:
    print("vercel team ok", json.loads(body).get("name"))
else:
    print("vercel team falhou", status)

status, body = get(
    f"https://api.cloudflare.com/client/v4/accounts/{env['CLOUDFLARE_ACCOUNT_ID']}/tokens/verify",
    {"Authorization": "Bearer " + env["CLOUDFLARE_API_TOKEN"]},
)
if status == 200 and json.loads(body).get("success"):
    print("cloudflare token ok")
else:
    print("cloudflare falhou", status)
