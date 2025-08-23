#!/usr/bin/env bash

set -euo pipefail

print_usage() {
  cat <<'USAGE'
Usage: setup-as-owner.sh --owner OWNER [--repo REPO] [--branch BRANCH] \
                         [--identity PATH_TO_PRIVATE_KEY] [--amend-author] \
                         [--delete-main] [--no-set-remote-head]

Description:
  Idempotently configures the current Git repo to push and author as the specified
  GitHub OWNER using a dedicated SSH host alias and private key. Optionally renames
  the branch, amends the latest commit author, and cleans up remote 'main'.

Options:
  --owner OWNER                GitHub username/owner to attribute and push as (required)
  --repo REPO                  Repository name (default: derive from remote or current directory)
  --branch BRANCH              Desired primary branch name (default: keep current)
  --identity PATH              Private key to use (default: newest ~/.ssh/id_ed25519_*)
  --amend-author               Amend latest commit to OWNER noreply author
  --delete-main                Delete remote 'main' branch if it exists
  --no-set-remote-head         Do not set origin HEAD to the chosen branch
  -h, --help                   Show this help

Examples:
  ./scripts/setup-as-owner.sh --owner DWSQUIRES --branch code-owner \
    --identity "$HOME/.ssh/id_ed25519_20250901_135928" --amend-author --delete-main
USAGE
}

OWNER=""
REPO=""
BRANCH=""
IDENTITY=""
AMEND_AUTHOR="false"
DELETE_MAIN="false"
SET_REMOTE_HEAD="true"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner)
      OWNER="${2:-}"; shift 2 ;;
    --repo)
      REPO="${2:-}"; shift 2 ;;
    --branch)
      BRANCH="${2:-}"; shift 2 ;;
    --identity)
      IDENTITY="${2:-}"; shift 2 ;;
    --amend-author)
      AMEND_AUTHOR="true"; shift ;;
    --delete-main)
      DELETE_MAIN="true"; shift ;;
    --no-set-remote-head)
      SET_REMOTE_HEAD="false"; shift ;;
    -h|--help)
      print_usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2; print_usage; exit 1 ;;
  esac
done

if [[ -z "$OWNER" ]]; then
  echo "--owner is required" >&2
  print_usage
  exit 1
fi

# Ensure we're in a git repo
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This directory is not a git repository." >&2
  exit 1
fi

# Determine repo name
if [[ -z "$REPO" ]]; then
  # Try remote
  if git remote get-url origin >/dev/null 2>&1; then
    url="$(git remote get-url origin)" || url=""
    # Extract repo name from common formats
    REPO=$(basename "${url%.git}") || true
  fi
  if [[ -z "$REPO" || "$REPO" == ".git" ]]; then
    REPO="$(basename "$(pwd)")"
  fi
fi

# Pick identity file
if [[ -z "$IDENTITY" ]]; then
  # newest id_ed25519_*
  IDENTITY=$(ls -t "$HOME"/.ssh/id_ed25519_* 2>/dev/null | grep -v ".pub$" | head -1 || true)
fi
if [[ -z "$IDENTITY" || ! -f "$IDENTITY" ]]; then
  echo "Private key not found. Provide with --identity PATH_TO_PRIVATE_KEY" >&2
  exit 1
fi

PUB_KEY="${IDENTITY}.pub"
if [[ ! -f "$PUB_KEY" ]]; then
  echo "Warning: public key not found at $PUB_KEY" >&2
fi

OWNER_ALIAS="github.com-${OWNER}"

echo "Using owner: $OWNER"
echo "Using repo : $REPO"
echo "Identity   : $IDENTITY"
echo "Alias Host : $OWNER_ALIAS"

# Configure SSH alias
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/config"
chmod 600 "$HOME/.ssh/config" || true

if ! grep -q "^Host ${OWNER_ALIAS}$" "$HOME/.ssh/config" 2>/dev/null; then
  {
    echo
    echo "Host ${OWNER_ALIAS}"
    echo "  HostName github.com"
    echo "  User git"
    echo "  IdentityFile ${IDENTITY}"
    echo "  IdentitiesOnly yes"
    echo "  AddKeysToAgent yes"
    echo "  UseKeychain yes"
  } >> "$HOME/.ssh/config"
else
  # Ensure IdentityFile matches
  tmpcfg="$(mktemp)"
  awk -v alias="$OWNER_ALIAS" -v key="$IDENTITY" '
    BEGIN{inblock=0}
    /^Host[[:space:]]+[^ ]+/ {inblock=($2==alias)}
    { if (inblock && $1=="IdentityFile") { $2=key } print }
  ' "$HOME/.ssh/config" > "$tmpcfg"
  mv "$tmpcfg" "$HOME/.ssh/config"
  chmod 600 "$HOME/.ssh/config" || true
fi

# Add key to agent
eval "$(ssh-agent -s)" >/dev/null
ssh-add "$IDENTITY" >/dev/null 2>&1 || true

# Set git author to OWNER noreply
git config user.name "$OWNER"
git config user.email "${OWNER}@users.noreply.github.com"

# Optionally amend latest commit author
if [[ "$AMEND_AUTHOR" == "true" ]]; then
  if git rev-parse --verify HEAD >/dev/null 2>&1; then
    git commit --amend --no-edit --reset-author || true
  fi
fi

# Branch handling
current_branch="$(git rev-parse --abbrev-ref HEAD)"
target_branch="$current_branch"
if [[ -n "$BRANCH" && "$BRANCH" != "$current_branch" ]]; then
  # If current is main, rename; else checkout/create
  if [[ "$current_branch" == "main" ]]; then
    git branch -m main "$BRANCH"
  else
    if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
      git checkout "$BRANCH"
    else
      git checkout -b "$BRANCH"
    fi
  fi
  target_branch="$BRANCH"
fi

# Set origin to owner alias
git remote set-url origin "git@${OWNER_ALIAS}:${OWNER}/${REPO}.git"

# Ensure remote exists and fetch
git fetch origin --prune >/dev/null 2>&1 || true

# Set upstream and push
git branch --set-upstream-to="origin/${target_branch}" "$target_branch" 2>/dev/null || true
if ! GIT_SSH_COMMAND="ssh -o IdentitiesOnly=yes -i ${IDENTITY}" git push -u origin "$target_branch"; then
  echo "Non-fast-forward; pushing with --force-with-lease" >&2
  GIT_SSH_COMMAND="ssh -o IdentitiesOnly=yes -i ${IDENTITY}" git push --force-with-lease origin "$target_branch"
fi

# Optionally delete remote main
if [[ "$DELETE_MAIN" == "true" ]]; then
  if git ls-remote --heads origin main | grep -q "refs/heads/main"; then
    git push origin :main || true
  fi
fi

# Optionally set remote HEAD
if [[ "$SET_REMOTE_HEAD" == "true" ]]; then
  git remote set-head origin -a >/dev/null 2>&1 || true
fi

echo "Done. Branch '$target_branch' is set to track origin/$target_branch as $OWNER."
if [[ -f "$PUB_KEY" ]]; then
  echo "Public key (also copying to clipboard if available):"
  command -v pbcopy >/dev/null 2>&1 && pbcopy < "$PUB_KEY" || true
  cat "$PUB_KEY"
fi


