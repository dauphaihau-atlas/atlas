#!/usr/bin/env bash
set -e

# Install Homebrew if not present
if ! command -v brew &>/dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Install mkcert if not present
if ! command -v mkcert &>/dev/null; then
    echo "Installing mkcert..."
    brew install mkcert
fi

# Install the local CA into the system trust store
mkcert -install

CERTS_DIR="$(dirname "$0")/nginx/certs"
mkdir -p "$CERTS_DIR"

# Generate certificates
mkcert \
    -cert-file "$CERTS_DIR/admin-dashboard.local.crt" \
    -key-file  "$CERTS_DIR/admin-dashboard.local.key" \
    admin-dashboard.local

mkcert \
    -cert-file "$CERTS_DIR/api.admin-dashboard.local.crt" \
    -key-file  "$CERTS_DIR/api.admin-dashboard.local.key" \
    api.admin-dashboard.local

echo "Certificates generated in $CERTS_DIR"
