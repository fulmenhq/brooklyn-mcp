#!/usr/bin/env bash

set -euo pipefail

# Export public keys for release verification.
# Copies minisign public key and exports GPG public key to dist/release/.
#
# Usage: scripts/export-release-keys.sh [dir]
#
# Env (same as sign-release-manifests.sh):
#   SIGNING_ENV_PREFIX - prefix for env var lookups (default: BROOKLYN)
#   <PREFIX>_MINISIGN_PUB - path to minisign public key
#   <PREFIX>_PGP_KEY_ID   - gpg key/email/fingerprint
#   <PREFIX>_GPG_HOMEDIR  - isolated gpg homedir
#
# Based on FulmenHQ patterns from goneat and fulminar.

DIR=${1:-dist/release}

if [ ! -d "$DIR" ]; then
    echo "error: directory $DIR not found" >&2
    exit 1
fi

SIGNING_ENV_PREFIX=${SIGNING_ENV_PREFIX:-BROOKLYN}

get_var() {
    local name="$1"
    if [ -n "${SIGNING_ENV_PREFIX}" ]; then
        local prefixed_name="${SIGNING_ENV_PREFIX}_${name}"
        local prefixed_val="${!prefixed_name:-}"
        if [ -n "$prefixed_val" ]; then
            echo "$prefixed_val"
            return 0
        fi
    fi
    echo "${!name:-}"
}

MINISIGN_KEY="$(get_var MINISIGN_KEY)"
MINISIGN_PUB="$(get_var MINISIGN_PUB)"
PGP_KEY_ID="$(get_var PGP_KEY_ID)"
GPG_HOMEDIR="$(get_var GPG_HOMEDIR)"

exported_any=false

# Derive public key path if not specified
if [ -z "${MINISIGN_PUB}" ] && [ -n "${MINISIGN_KEY}" ]; then
    derived_pub="${MINISIGN_KEY%.key}.pub"
    if [ -f "${derived_pub}" ]; then
        MINISIGN_PUB="${derived_pub}"
    fi
fi

# Export minisign public key
if [ -n "${MINISIGN_PUB}" ]; then
    if [ ! -f "${MINISIGN_PUB}" ]; then
        echo "error: MINISIGN_PUB=${MINISIGN_PUB} not found" >&2
        exit 1
    fi
    dest="${DIR}/fulmenhq-release-minisign.pub"
    cp "${MINISIGN_PUB}" "${dest}"
    echo "Exported minisign public key to ${dest}"
    exported_any=true
fi

# Export GPG public key
if [ -n "${PGP_KEY_ID}" ]; then
    if [ -z "${GPG_HOMEDIR}" ]; then
        echo "error: GPG_HOMEDIR required for PGP key export" >&2
        exit 1
    fi
    if ! command -v gpg > /dev/null 2>&1; then
        echo "error: gpg not found in PATH" >&2
        exit 1
    fi
    dest="${DIR}/fulmenhq-release-signing-key.asc"
    gpg --homedir "${GPG_HOMEDIR}" --armor --export "${PGP_KEY_ID}" > "${dest}"
    echo "Exported GPG public key to ${dest}"
    exported_any=true
fi

if [ "${exported_any}" = false ]; then
    echo "warning: no keys exported (set MINISIGN_PUB or PGP_KEY_ID)" >&2
    exit 1
fi

echo ""
echo "Key export complete. Verify keys are public-only before uploading:"
echo "  - minisign: should be a single line starting with 'untrusted comment:'"
echo "  - GPG: should contain 'PUBLIC KEY BLOCK', not 'PRIVATE KEY BLOCK'"
