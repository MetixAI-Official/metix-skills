#!/usr/bin/env bash
# Installs this checkout exactly as the public skills CLI would and verifies that
# every copied Skill is usable without reaching back into the source repository.
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
smoke_root=$(mktemp -d /tmp/metix-skills-install.XXXXXX)
cleanup() { rm -rf -- "$smoke_root"; }
trap cleanup EXIT

cd "$smoke_root"
git init -q
npx --yes skills add "$repo_root" --skill '*' --agent codex -y --copy >/dev/null

installed_root="$smoke_root/.agents/skills"
skill_count=0
for skill_dir in "$installed_root"/metix-*; do
  [ -d "$skill_dir" ] || continue
  skill_count=$((skill_count + 1))
  [ -f "$skill_dir/SKILL.md" ] || { echo "missing SKILL.md: $skill_dir" >&2; exit 1; }
  grep -Fq 'METIX_KEY' "$skill_dir/SKILL.md" || { echo "missing METIX_KEY: $skill_dir" >&2; exit 1; }
  grep -Fq 'GET /docs' "$skill_dir/SKILL.md" || { echo "missing GET /docs: $skill_dir" >&2; exit 1; }
  grep -Fq '/contract' "$skill_dir/SKILL.md" || { echo "missing /contract: $skill_dir" >&2; exit 1; }
  grep -Fq 'docs_url' "$skill_dir/SKILL.md" || { echo "missing docs_url: $skill_dir" >&2; exit 1; }
done

expected=$(find "$repo_root/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d " ")
[ "$skill_count" -eq "$expected" ] || { echo "expected $expected installed skills, found $skill_count" >&2; exit 1; }
echo "OK — clean npx install copied $skill_count pointer skills."
