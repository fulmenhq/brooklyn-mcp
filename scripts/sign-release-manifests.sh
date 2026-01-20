#!/usr/bin/env bash

set -euo pipefail

# Dual-format release signing: minisign (required) + optional PGP.
# Signs checksum manifests only (SHA256SUMS, SHA512SUMS).
#
# Usage: scripts/sign-release-manifests.sh <tag> [dir]
#
# Env (prefixed form preferred, e.g., BROOKLYN_MINISIGN_KEY):
#   SIGNING_ENV_PREFIX - prefix for env var lookups (default: BROOKLYN)
#   SIGNING_APP_NAME   - human-readable name for signing metadata (default: brooklyn)
#   <PREFIX>_MINISIGN_KEY - path to minisign secret key (required for minisign signing)
#   <PREFIX>_MINISIGN_PUB - optional path to minisign public key
#   <PREFIX>_PGP_KEY_ID   - gpg key/email/fingerprint for PGP signing (optional)
#   <PREFIX>_GPG_HOMEDIR  - isolated gpg homedir for signing (required if PGP_KEY_ID is set)
#   CI                    - if "true", signing is refused (safety guard)
#
# Prefixed vars take priority over generic (e.g., BROOKLYN_GPG_HOMEDIR over GPG_HOMEDIR)
# to avoid polluting user's default keyring settings.
#
# Based on FulmenHQ signing patterns from goneat and fulminar.

TAG=${1:?'usage: scripts/sign-release-manifests.sh <tag> [dir]'}
DIR=${2:-dist/release}

if [ "${CI:-}" = "true" ]; then
    echo "error: signing is disabled in CI (manual signing required for security)" >&2
    exit 1
fi

if [ ! -d "$DIR" ]; then
    echo "error: directory $DIR not found" >&2
    exit 1
fi

# Brooklyn-specific defaults
SIGNING_ENV_PREFIX=${SIGNING_ENV_PREFIX:-BROOKLYN}
SIGNING_APP_NAME=${SIGNING_APP_NAME:-brooklyn}

get_var() {
    local name="$1"
    # Prefixed form takes priority (e.g., BROOKLYN_GPG_HOMEDIR over GPG_HOMEDIR)
    if [ -n "${SIGNING_ENV_PREFIX}" ]; then
        local prefixed_name="${SIGNING_ENV_PREFIX}_${name}"
        local prefixed_val="${!prefixed_name:-}"
        if [ -n "$prefixed_val" ]; then
            echo "$prefixed_val"
            return 0
        fi
    fi

    # Fall back to generic form
    echo "${!name:-}"
}

MINISIGN_KEY="$(get_var MINISIGN_KEY)"
MINISIGN_PUB="$(get_var MINISIGN_PUB)"
PGP_KEY_ID="$(get_var PGP_KEY_ID)"
GPG_HOMEDIR="$(get_var GPG_HOMEDIR)"

# Ensure GPG_TTY is set for pinentry in interactive terminals (fixes Ghostty)
if [ -t 0 ]; then
    export GPG_TTY="$(tty)"
    gpg-connect-agent updatestartuptty /bye > /dev/null 2>&1 || true
fi

has_minisign=false
has_pgp=false

if [ -n "${MINISIGN_KEY}" ]; then
    if [ ! -f "${MINISIGN_KEY}" ]; then
        echo "error: MINISIGN_KEY=${MINISIGN_KEY} not found" >&2
        exit 1
    fi
    if ! command -v minisign > /dev/null 2>&1; then
        echo "error: minisign not found in PATH" >&2
        echo "  install: brew install minisign (macOS) or see https://jedisct1.github.io/minisign/" >&2
        exit 1
    fi
    has_minisign=true
    echo "minisign signing enabled (key: ${MINISIGN_KEY})"
fi

if [ -n "${PGP_KEY_ID}" ]; then
    if ! command -v gpg > /dev/null 2>&1; then
        echo "error: PGP_KEY_ID set but gpg not found in PATH" >&2
        exit 1
    fi
    if [ -z "${GPG_HOMEDIR}" ]; then
        echo "error: GPG_HOMEDIR (or ${SIGNING_ENV_PREFIX}_GPG_HOMEDIR) must be set for PGP signing" >&2
        exit 1
    fi
    if ! gpg --homedir "${GPG_HOMEDIR}" --list-secret-keys "${PGP_KEY_ID}" > /dev/null 2>&1; then
        echo "error: secret key ${PGP_KEY_ID} not found in GPG_HOMEDIR=${GPG_HOMEDIR}" >&2
        exit 1
    fi
    has_pgp=true
    echo "PGP signing enabled (key: ${PGP_KEY_ID}, homedir: ${GPG_HOMEDIR})"
fi

echo ""

if [ "${has_minisign}" = false ] && [ "${has_pgp}" = false ]; then
    echo "error: no signing method available" >&2
    echo "  set MINISIGN_KEY (or ${SIGNING_ENV_PREFIX}_MINISIGN_KEY) for minisign signing" >&2
    echo "  optionally set PGP_KEY_ID (or ${SIGNING_ENV_PREFIX}_PGP_KEY_ID) for PGP signing" >&2
    exit 1
fi

if [ ! -f "${DIR}/SHA256SUMS" ]; then
    echo "error: ${DIR}/SHA256SUMS not found (run 'bun run package:all' first)" >&2
    exit 1
fi

timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Derive public key path if not specified
if [ -z "${MINISIGN_PUB}" ] && [ -n "${MINISIGN_KEY}" ]; then
    derived_pub="${MINISIGN_KEY%.key}.pub"
    if [ -f "${derived_pub}" ]; then
        MINISIGN_PUB="${derived_pub}"
    fi
fi

sign_minisign() {
    local manifest="$1"
    local base="${DIR}/${manifest}"

    if [ ! -f "${base}" ]; then
        return 0
    fi

    echo "Signing ${manifest} with minisign..."
    rm -f "${base}.minisig"
    if [ -r /dev/tty ]; then
        minisign -S -s "${MINISIGN_KEY}" -t "${SIGNING_APP_NAME} ${TAG} ${timestamp}" -m "${base}" < /dev/tty
    else
        minisign -S -s "${MINISIGN_KEY}" -t "${SIGNING_APP_NAME} ${TAG} ${timestamp}" -m "${base}"
    fi
}

sign_pgp() {
    local manifest="$1"
    local base="${DIR}/${manifest}"

    if [ ! -f "${base}" ]; then
        return 0
    fi

    echo "Signing ${manifest} with PGP..."
    rm -f "${base}.asc"
    gpg --batch --yes --armor --homedir "${GPG_HOMEDIR}" --local-user "${PGP_KEY_ID}" --detach-sign -o "${base}.asc" "${base}"
}

if [ "${has_minisign}" = true ]; then
    sign_minisign "SHA256SUMS"
    sign_minisign "SHA512SUMS"
fi

if [ "${has_pgp}" = true ]; then
    sign_pgp "SHA256SUMS"
    sign_pgp "SHA512SUMS"
fi

echo ""
echo "Signing complete for ${TAG}"
if [ "${has_minisign}" = true ]; then
    echo "   minisign: SHA256SUMS.minisig$([ -f "${DIR}/SHA512SUMS" ] && echo ", SHA512SUMS.minisig")"
fi
if [ "${has_pgp}" = true ]; then
    echo "   PGP: SHA256SUMS.asc$([ -f "${DIR}/SHA512SUMS" ] && echo ", SHA512SUMS.asc")"
fi
