"""重新觸發 GitHub Actions 的部署流程（用 git 已儲存的憑證，不顯示憑證內容）。"""
import json
import subprocess
import sys
import time
import urllib.request
import urllib.error

OWNER = "Joshua19683721"
REPO = "m2"
API = f"https://api.github.com/repos/{OWNER}/{REPO}"


def get_credential():
    p = subprocess.run(
        ["git", "credential", "fill"],
        input=f"protocol=https\nhost=github.com\nusername={OWNER}\n\n",
        capture_output=True, text=True,
        env={"GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never",
             "PATH": "C:/Windows/System32"})
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
    data = json.dumps(payload).encode() if payload is not None else None
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=25) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return 0, str(e)


token = get_credential()
if not token:
    print("取不到憑證")
    sys.exit(1)

# 觸發
st, body = call("POST", f"{API}/actions/workflows/deploy.yml/dispatches", token, {"ref": "main"})
print(f"[dispatch] {st}")

wait = int(sys.argv[1]) if len(sys.argv) > 1 else 180
for i in range(wait // 10):
    time.sleep(10)
    st, body = call("GET", f"{API}/actions/runs?per_page=1", token)
    if st != 200:
        continue
    runs = json.loads(body)["workflow_runs"]
    if not runs:
        continue
    r = runs[0]
    print(f"  [{i*10+10:>3}s] status={r['status']:<10} conclusion={r['conclusion']}")
    if r["status"] == "completed":
        run_id = r["id"]
        st2, b2 = call("GET", f"{API}/actions/runs/{run_id}/jobs", token)
        for job in json.loads(b2)["jobs"]:
            print(f"    job {job['name']} -> {job['conclusion']}")
            for s in job["steps"]:
                if s["conclusion"] not in ("skipped", None):
                    print(f"       {s['number']}. {s['name']} -> {s['conclusion']}")
        break
