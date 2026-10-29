#!/usr/bin/env python3
"""Package the editable static site and local Skill. No build dependencies."""
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
site = ROOT / "assets/site"
package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
version, name = package["version"], package["name"]
shutil.copyfile(site / "index.html", site / "zh/index.html")
files = {
    p.relative_to(site).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
    for p in sorted(site.rglob("*")) if p.is_file()
}
(ROOT / "assets/manifest.json").write_text(
    json.dumps({"version": version, "files": files}, indent=2) + "\n", encoding="utf-8")
out = ROOT / "dist"
out.mkdir(exist_ok=True)
archive = out / ("%s-v%s.zip" % (name, version))
included = ["SKILL.md", "README.md", "LICENSE", "package.json",
            "launch-mac.command", "launch-windows.cmd", "launch-linux.sh"]
for directory in ["assets", "scripts", "agents", "tests"]:
    included += [p.relative_to(ROOT).as_posix() for p in (ROOT / directory).rglob("*")
                 if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc"]
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zipped:
    for file in sorted(included):
        zipped.write(ROOT / file, name + "/" + file)
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix(".zip.sha256").write_text(
    "%s  %s\n" % (digest, archive.name), encoding="utf-8")
print(archive)
