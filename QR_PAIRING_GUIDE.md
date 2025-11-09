# WA Gateway QR Code and Pairing Session Guide

## Understanding Session Types

WA Gateway supports two types of WhatsApp connections:

### 1. QR Code Sessions
- Used for regular WhatsApp accounts
- Process: Create session → Get QR → Scan QR with phone
- Session ID: Any custom name (e.g., "my_session", "business_account")

### 2. Phone Pairing Sessions
- Used for Business WhatsApp accounts or when QR is not available
- Process: Create pairing session → Get pairing code → Enter code in WhatsApp
- Session ID: Automatically generated as "pair_{phone}_{timestamp}"

## Common Issues and Solutions

### QR Code Not Showing
**Problem:** Error "No token provided" or QR code not appearing
**Solution:** 
1. For QR sessions: Create a regular session (not pairing), then request `/api/v1/sessions/{sessionId}/qr`
2. QR code is sent via WebSocket when available - make sure WebSocket connection is active
3. Check that you're creating the right type of session

### Pairing Code vs QR Code
**Problem:** Creating a session with pairing format but expecting QR
**Solution:** 
- For QR: Create session with custom ID, don't use "pair_" prefix
- For pairing: Use phone pairing endpoint, expect pairing code, not QR

## API Endpoints

### For QR Sessions
1. Create session: `POST /api/v1/sessions` with body `{ "sessionId": "my_custom_name" }`
2. Request QR: `GET /api/v1/sessions/my_custom_name/qr`
3. Monitor WebSocket for QR in session-update events

### For Phone Pairing
1. Initiate pairing: `POST /api/v1/session/pair-phone` with phone number
2. Monitor pairing status: `GET /api/v1/session/{pairing_session_id}/pair-status`
3. Get pairing code from the response/status

## Troubleshooting Steps

1. Check if your session is a pairing session (starts with "pair_") or regular session
2. Verify WebSocket connection is active in browser console
3. Check server logs for connection errors
4. Ensure Redis is connected and responsive
5. Verify session exists before requesting QR/pairing status

## Error "No token provided"
This error usually indicates an attempt to access a protected API endpoint without proper authentication. However, `/api/v1/sessions/{id}/qr` should NOT require a token - if you're seeing this error for that endpoint, check if:
1. The endpoint was moved to protected routes in a newer version
2. There's a configuration issue with your installation
3. The server is returning the wrong error message