#!/usr/bin/env python3
"""Packages the project into a clean, GitHub-ready ZIP archive.

Usage:
    python3 scripts/export_zip.py [output.zip]
    bun run export:zip

Includes: contracts (source, tests, deploy scripts), frontend (src, configs), docs, lockfile,
vendored forge-std, env template and deployment record.
Excludes: node_modules, build output, caches, .env (secrets), logs, editor/agent folders and
tooling that only works inside Arc Studio.
"""
import json
import os
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROJECT = "arcpay-automated-vault"
DEFAULT_OUT = ROOT / "exports" / f"{PROJECT}.zip"

EXCLUDE_DIRS = {
    "node_modules", ".git", "exports", "dist", "cache", "out", "broadcast", ".agents",
    "imported", ".vite", ".turbo", ".idea", ".vscode",
}
EXCLUDE_FILES = {
    ".env", "traces.jsonl", "console.jsonl", "AGENTS.md", ".DS_Store",
    # Arc Studio-only deployment tooling (needs packages that are not in package.json)
    "compass-deploy.ts", "compass-deploy-helpers.ts", "self-deploy.ts", "fetch-abi.ts",
}
EXCLUDE_PATHS = {
    # Studio deployment record contains internal wallet ids; deployments/arc-testnet.json replaces it
    "contracts/contract-metadata",
}
# Never ship anything that looks like a secret
SECRET_MARKERS = ("PRIVATE_KEY=0x", "RPC_PROXY_TOKEN=", "CIRCLE_API_KEY=", "ENTITY_SECRET=")


def skip(rel: Path) -> bool:
    parts = rel.parts
    if any(p in EXCLUDE_DIRS for p in parts[:-1]):
        return True
    if rel.name in EXCLUDE_FILES:
        return True
    posix = rel.as_posix()
    return any(posix == p or posix.startswith(p + "/") for p in EXCLUDE_PATHS)


def exported_package_json() -> str:
    pkg = json.loads((ROOT / "package.json").read_text())
    scripts = pkg.get("scripts", {})
    # Drop scripts whose files are not part of the export
    for name in ("compass:deploy", "deploy:self", "fetch:abi"):
        scripts.pop(name, None)
    return json.dumps(pkg, indent=2) + "\n"


def main() -> int:
    out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUT
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()

    added = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for dirpath, dirnames, filenames in os.walk(ROOT):
            dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDE_DIRS)
            for name in sorted(filenames):
                path = Path(dirpath) / name
                rel = path.relative_to(ROOT)
                if skip(rel) or path.resolve() == out:
                    continue
                if rel.as_posix() == "package.json":
                    data = exported_package_json().encode()
                else:
                    data = path.read_bytes()
                    if rel.suffix in {".ts", ".tsx", ".json", ".md", ".sol", ".example", ".sh", ".py", ".toml", ".txt", ".css"}:
                        text = data.decode("utf-8", errors="ignore")
                        if rel.name != "export_zip.py" and any(m in text for m in SECRET_MARKERS):
                            print(f"refusing to export {rel}: looks like it contains a secret", file=sys.stderr)
                            return 1
                zf.writestr(f"{PROJECT}/{rel.as_posix()}", data)
                added += 1

    size_kb = out.stat().st_size / 1024
    print(f"Wrote {out} ({added} files, {size_kb:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
