#!/bin/bash

# Safe cleanup script for specific pairing session
# Usage: ./cleanup-pairing-session.sh <phone_number>

if [ -z "$1" ]; then
    echo "Usage: $0 <phone_number>"
    echo "Example: $0 6285771518231"
    exit 1
fi

PHONE_NUMBER=$1

echo "🧹 Cleaning up pairing session for: $PHONE_NUMBER"

# 1. Remove auth folder for this phone number
echo "📁 Removing auth folders..."
rm -rf "auth_info_baileys/pair_${PHONE_NUMBER}_"*
echo "✅ Auth folders removed"

# 2. Remove Redis keys for this phone number (SAFE - only specific keys)
echo "🗄️  Removing Redis keys..."
redis-cli --scan --pattern "wa-gateway:pairing:pair_${PHONE_NUMBER}_*" | while read key; do
    redis-cli DEL "$key"
    echo "   Deleted: $key"
done
echo "✅ Redis keys removed"

# 3. List remaining sessions (for verification)
echo ""
echo "📊 Remaining sessions in Redis:"
redis-cli --scan --pattern "wa-gateway:pairing:*" | head -5
echo ""
echo "✅ Cleanup complete for $PHONE_NUMBER"
echo "⚠️  Note: This only removed pairing data, not active sessions"
