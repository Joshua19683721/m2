"""抓指定 workflow run 的失敗步驟日誌尾端。"""
import io
import json
import subprocess
import sys
import urllib.request
import urllib.error
import zipfile

OWNER = "Joshua19683721"
REPO = "m2"


def get_credential():
    p = subprocess.run(
        ["git", "credential", "fill"],
        input=f"protocol=https\nhost=github.com\nusername={OWNER}\n\n",
        capture_output=True, text=True,
        env={"GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never",
             "PATH": "C:/Windows/System32"})
    c = {}
    for line in p.stdout.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            c[k.strip()] = v.strip()
    return c.get("password")


token = get_credential()
run_id = sys.argv[1] if len(sys.argv) > 1 else ""

base = f"https://api.github.com/repos/{OWNER}/{REPO}"
h = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
     "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "dsh"}

req = urllib.request.Request(f"{base}/actions/runs/{run_id}/logs")
for k, v in h.items():
    req.add_header(k, v)
try:
    with urllib.request.urlopen(req, timeout=40) as r:
        raw = r.read()
except urllib.error.HTTPError as e:
    print("抓日誌失敗:", e.code, e.read().decode()[:200])
    sys.exit(1)

z = zipfile.ZipFile(io.BytesIO(raw))
for name in z.namelist():
    if not name.endswith(".txt"):
        continue
    text = z.read(name).decode("utf-8", errors="replace")
    if "##[error]" in text or "##[group]Run" in text:
        print("=" * 60)
        print(name)
        print("=" * 60)
        lines = text.splitlines()
        # 只印最後 60 行與所有 error 行
        for i, ln in enumerate(lines):
            if "##[error]" in ln:
                for j in range(max(0, i - 12), min(len(lines), i + 4)):
                    print(lines[j])
                print("-" * 40)
        print("\n... 最後 25 行 ...")
        for ln in lines[-25:]:
            print(ln)
        break
