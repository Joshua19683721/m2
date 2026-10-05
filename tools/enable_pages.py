"""用 git 已儲存的憑證呼叫 GitHub API，啟用該倉庫的 GitHub Pages（workflow 來源）。
不會把憑證輸出到畫面。"""
import json
import subprocess
import urllib.request
import urllib.error

OWNER = "Joshua19683721"
REPO = "m2"
API = f"https://api.github.com/repos/{OWNER}/{REPO}/pages"


def get_credential():
    """問 git 要它已儲存的 HTTPS 憑證（輸出直接進變數，不 print）。"""
    p = subprocess.run(
        ["git", "credential", "fill"],
        input=f"protocol=https\nhost=github.com\nusername={OWNER}\n\n",
        capture_output=True, text=True,
        env={"GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never",
             "PATH": "C:/Windows/System32"},
    )
    creds = {}
    for line in p.stdout.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            creds[k.strip()] = v.strip()
    return creds.get("password")


def call(method, url, token, payload=None):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "dsh-setup")
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=25) as r:
            return r.status, r.read().decode()[:400]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]
    except Exception as e:
        return 0, str(e)


token = get_credential()
if not token:
    print("取不到已儲存的憑證")
    raise SystemExit(1)

print("憑證長度:", len(token), "字元（不顯示內容）")

st, body = call("GET", API, token)
print(f"[GET pages]  {st}  {body[:160]}")

if st == 404:
    st, body = call("POST", API, token, {"build_type": "workflow"})
    print(f"[POST pages] {st}  {body[:300]}")
elif st == 200:
    st, body = call("PUT", f"{API}/update", token, {"build_type": "workflow"})
    print(f"[PUT  pages] {st}  {body[:200]}")
