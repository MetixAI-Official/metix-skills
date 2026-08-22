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
  [ -f "$skill_dir/references/api-reference.md" ] || { echo "missing api-reference.md: $skill_dir" >&2; exit 1; }
  [ -f "$skill_dir/references/credits.md" ] || { echo "missing credits.md: $skill_dir" >&2; exit 1; }
  grep -Fq 'references/api-reference.md' "$skill_dir/SKILL.md" || { echo "missing api reference link: $skill_dir" >&2; exit 1; }
  grep -Fq 'references/credits.md' "$skill_dir/SKILL.md" || { echo "missing credits link: $skill_dir" >&2; exit 1; }
done

[ "$skill_count" -eq 5 ] || { echo "expected 5 installed skills, found $skill_count" >&2; exit 1; }
echo "OK — clean npx install copied 5 self-contained skills."
