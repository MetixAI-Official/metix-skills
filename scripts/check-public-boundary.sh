#!/usr/bin/env bash
# Fails if anything in this repository names something that is not public.
#
# This repository is derivable from the public API contract alone. Internal
# identifiers — Elasticsearch index aliases, the internal search proxy, account
# ids, restricted field names — must never appear here, even in an example or a
# comment. A leak is not obvious on review, so it is a check rather than a habit.
#
# Run: scripts/check-public-boundary.sh
set -uo pipefail
cd "$(dirname "$0")/.."

# Paths that must never be named: the internal proxy and anything under it.
BANNED_PATHS=(
  "es-search"
  "people-stats"
)

# Withdrawn or never-public capabilities. Naming them sends agents at a 404,
# which is the failure this repository exists to end.
#
# The MVP narrowing of 2026-08 cut the public surface to people, companies and
# jobs, each reached through a Query Spec search and a detail-by-id call. Every
# route it removed is listed here, because an agent that read the old docs will
# otherwise keep reaching for one. Contact email is a different case: the routes
# exist but are not open, so the word may appear as "coming soon" and is not
# banned, while a callable example or a price for it is caught in review.
BANNED_CAPABILITIES=(
  "people-grade"
  "people-bulk-grade"
  "people-compare"
  "people-lookup"
  "people-fast-search"
  "people-unlock"
  "company-fast-search"
  "job-fast-search"
  "scholar-fast-search"
  "detail-by-linkedin-url"
  "Watcher"
  "Quick Match"
  "Standard Match"
  "Deep Match"
)

# Restricted profile fields that public keys may not select.
BANNED_FIELDS=(
  "contact_email"
  "personal_emails"
  "phone_numbers"
)

# Paths that must not exist in this repository at all, whatever they contain.
# Content scanning cannot catch these: agent scratch state names no banned word,
# yet it carries local absolute paths and captured internal figures. A check that
# only asks "what does this file say" misses "this file should not be here".
FORBIDDEN_PATHS=(
  ".omc"
  ".claude"
  ".codex"
  ".env"
)

fail=0
report() { printf '  %-34s %s\n' "$1" "$2"; fail=1; }

scan() {
  local label="$1"; shift
  for needle in "$@"; do
    # Exclude this script itself: it necessarily contains every banned string.
    hit=$(grep -rn --binary-files=without-match -F "$needle" . \
            --exclude-dir=.git \
            --exclude="check-public-boundary.sh" 2>/dev/null || true)
    if [ -n "$hit" ]; then
      report "$needle" "($label)"
      echo "$hit" | sed 's/^/      /'
    fi
  done
}

echo "Checking the public boundary..."

# File-level rule first: presence is the violation, regardless of content.
for path in "${FORBIDDEN_PATHS[@]}"; do
  tracked=$(git ls-files "$path" "$path/**" 2>/dev/null || true)
  if [ -n "$tracked" ]; then
    report "$path" "(must not be committed)"
    echo "$tracked" | sed 's/^/      /'
  elif [ -e "$path" ] && ! git check-ignore -q "$path" 2>/dev/null; then
    # Present, not tracked, and not ignored — one `git add .` away from being
    # committed. A locally ignored copy is fine and is not reported, so this
    # check does not cry wolf on a normal working tree.
    report "$path" "(present and not ignored — add it to .gitignore)"
  fi
done

scan "internal path"        "${BANNED_PATHS[@]}"
scan "withdrawn capability" "${BANNED_CAPABILITIES[@]}"
scan "restricted field"     "${BANNED_FIELDS[@]}"

# Account identifiers: usr_ followed by hex is the real shape.
hit=$(grep -rEn --binary-files=without-match 'usr_[0-9a-f]{6,}' . \
        --exclude-dir=.git --exclude="check-public-boundary.sh" 2>/dev/null || true)
if [ -n "$hit" ]; then
  report "usr_<hex> account id" "(account identifier)"
  echo "$hit" | sed 's/^/      /'
fi

# Index aliases are dated or versioned names; catch the shape, not a fixed list,
# so a new index cannot slip through by not being on it.
hit=$(grep -rEn --binary-files=without-match '\b(profiles|companies|jobs|scholars)_[0-9v][0-9a-z_]*' . \
        --exclude-dir=.git --exclude="check-public-boundary.sh" 2>/dev/null || true)
if [ -n "$hit" ]; then
  report "index alias shape" "(internal index)"
  echo "$hit" | sed 's/^/      /'
fi

if [ "$fail" -eq 0 ]; then
  echo "OK — no internal identifier found."
  exit 0
fi
echo
echo "FAILED — the strings above are internal and must not appear in a public skill."
exit 1
