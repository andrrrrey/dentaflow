"""Extended Novofon auth diagnostic — run inside backend container."""
import asyncio, base64, hashlib, hmac as hmac_lib, httpx

KEY = "appid_5052996"
SEC = "ekzwv42ndedth2l9zlxcphpceky9pcbr728vaur2"

def hmac_sha1(secret, data):
    return base64.b64encode(
        hmac_lib.new(secret.encode(), data.encode(), hashlib.sha1).digest()
    ).decode()

def hmac_sha256(secret, data):
    return base64.b64encode(
        hmac_lib.new(secret.encode(), data.encode(), hashlib.sha256).digest()
    ).decode()

def md5(s):
    return hashlib.md5(s.encode()).hexdigest()

# Classic Zadarma sign (params_str + MD5(params_str))
sign_sha1   = hmac_sha1(SEC,   "" + md5(""))
sign_sha256 = hmac_sha256(SEC, "" + md5(""))
# Alternative: HMAC of just the key
sign_key_sha1 = hmac_sha1(SEC, KEY)
b64 = base64.b64encode(f"{KEY}:{SEC}".encode()).decode()

TESTS = [
    # --- different domains ---
    ("novofon.com /v1/info/balance + key:sign_sha1",
     "GET", "https://api.novofon.com/v1/info/balance",
     {"Authorization": f"{KEY}:{sign_sha1}"}, {}),

    ("novofon.ru  /v1/info/balance + key:sign_sha1",
     "GET", "https://api.novofon.ru/v1/info/balance",
     {"Authorization": f"{KEY}:{sign_sha1}"}, {}),

    ("novofon.com /v1/info/balance + key:sign_sha256",
     "GET", "https://api.novofon.com/v1/info/balance",
     {"Authorization": f"{KEY}:{sign_sha256}"}, {}),

    # --- query param style ---
    ("novofon.com /v1/info/balance ?user_key&sign",
     "GET", "https://api.novofon.com/v1/info/balance",
     {}, {"user_key": KEY, "sign": sign_sha1}),

    ("novofon.com /v1/info/balance ?key&secret",
     "GET", "https://api.novofon.com/v1/info/balance",
     {}, {"key": KEY, "secret": SEC}),

    # --- PBX-specific endpoints ---
    ("novofon.com /v1/pbx/internal + key:sign",
     "GET", "https://api.novofon.com/v1/pbx/internal",
     {"Authorization": f"{KEY}:{sign_sha1}"}, {}),

    ("novofon.com /v1/info/balance + key:sign_key",
     "GET", "https://api.novofon.com/v1/info/balance",
     {"Authorization": f"{KEY}:{sign_key_sha1}"}, {}),

    # --- maybe they want X-Api-Key header ---
    ("novofon.com X-Api-Key + X-Api-Secret",
     "GET", "https://api.novofon.com/v1/info/balance",
     {"X-Api-Key": KEY, "X-Api-Secret": SEC}, {}),

    # --- maybe token endpoint first ---
    ("novofon.com POST /v1/oauth/token",
     "POST", "https://api.novofon.com/v1/oauth/token",
     {"Content-Type": "application/json"}, {}),
]

async def run():
    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as c:
        for label, method, url, headers, params in TESTS:
            try:
                if method == "GET":
                    r = await c.get(url, headers=headers, params=params)
                else:
                    r = await c.post(url, headers=headers, json={"key": KEY, "secret": SEC})
                ok = "✅" if r.status_code == 200 else "❌"
                print(f"{ok} [{r.status_code}] {label}")
                print(f"   {r.text[:120]}")
            except Exception as e:
                print(f"💥 {label}: {e}")

asyncio.run(run())
