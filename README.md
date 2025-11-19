# WhatsApp Gateway API

Production-ready WhatsApp Gateway with QR + Phone Pairing authentication, Redis session storage, and webhook integration.

## Features

✅ Phone Pairing + QR Code authentication  
✅ Multi-session support (unlimited)  
✅ Redis session storage  
✅ WebSocket real-time updates  
✅ Webhook push to N8N  
✅ Web dashboard for session management  
✅ Docker deployment ready  

## Quick Start

### Local Testing

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env: Set API_KEY
npm start
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env
# Edit .env: Set REACT_APP_API_KEY
npm start
# Visit http://localhost:3001
```

### Docker Deployment

```bash
cp .env.example .env
# Edit .env with your configuration
docker-compose up --build -d
```

Access the application at `http://localhost:3001`

## API Usage

### Start Pairing Session

```bash
curl -X POST http://localhost:3000/api/pairing/start/SESSION001 \
  -H "x-api-key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"628123456789"}'
```

**Response:**
```json
{
  "success": true,
  "sessionId": "SESSION001",
  "phoneNumber": "628123456789",
  "pairingCode": "ABCD1234",
  "status": "waiting_pairing",
  "expiresIn": 300
}
```

**Next Steps:**
1. Open WhatsApp on your phone
2. Go to **Settings → Linked Devices**
3. Tap **"Link a Device"**
4. Tap **"Link with phone number instead"**
5. Enter the pairing code

### Send Message

```bash
curl -X POST http://localhost:3000/api/pairing/send/SESSION001 \
  -H "x-api-key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"to":"628987654321","message":"Hello from WA Gateway!"}'
```

### List Sessions

```bash
curl http://localhost:3000/api/pairing/sessions \
  -H "x-api-key: your-key"
```

### Get Session Status

```bash
curl http://localhost:3000/api/pairing/status/SESSION001 \
  -H "x-api-key: your-key"
```

### Delete Session

```bash
curl -X DELETE http://localhost:3000/api/pairing/session/SESSION001 \
  -H "x-api-key: your-key"
```

### Send Bulk Messages

```bash
curl -X POST http://localhost:3000/api/pairing/send-bulk/SESSION001 \
  -H "x-api-key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": ["628111111111", "628222222222"],
    "message": "Bulk message test",
    "delay": 2000
  }'
```

## Environment Variables

### Backend (.env)

```env
PORT=3000
API_KEY=your-secret-api-key
REDIS_HOST=163.61.44.41
REDIS_PORT=6379
REDIS_PASSWORD=b5cf82712e2201393c9e
BASE_WEBHOOK_URL=https://your-webhook-url.com/webhook
SESSION_PATH=./session
AUTO_RESTORE_SESSIONS=true
```

### Frontend (.env)

```env
REACT_APP_API_URL=http://localhost:3000
REACT_APP_WS_URL=ws://localhost:3000
REACT_APP_API_KEY=your-secret-api-key
PORT=3001
```

## Architecture

- **Backend:** Express + Baileys + Redis + Socket.io
- **Frontend:** React + Axios + Socket.io-client
- **Storage:** Redis (session metadata) + Filesystem (Baileys credentials)
- **Integration:** Webhook push to N8N for all events

## Testing

### Test Redis Connection

```bash
cd backend
node scripts/test-redis.js
```

### Test Pairing Flow

```bash
cd backend
node scripts/test-pairing.js
# Follow instructions to enter code in WhatsApp
```

### Test Webhook

```bash
cd backend
node scripts/test-webhook.js
# Update .env to point to http://localhost:4000/webhook
# Restart backend and trigger events
```

## Troubleshooting

### Redis Connection Failed

- Check Redis host/port/password in `.env`
- Verify network access to `163.61.44.41:6379`
- Test connection: `redis-cli -h 163.61.44.41 -p 6379 -a <password> ping`

### Pairing Code Not Working

- Ensure phone format is correct: `62xxxxxxxxxx` (no + or spaces)
- Pairing code expires in 5 minutes
- Make sure WhatsApp is not already logged in elsewhere

### Session Not Connecting

- Check if WhatsApp is logged out from the device
- Try restarting the session via API or dashboard
- Check backend logs for error messages

### Webhook Not Receiving Events

- Verify `BASE_WEBHOOK_URL` is correctly set in `.env`
- Check if N8N workflow is active
- Test webhook endpoint with: `curl -X POST <webhook-url> -d '{"test":"data"}'`
- Use https://webhook.site for testing

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/pairing/start/:sessionId` | Start pairing session |
| GET | `/api/pairing/status/:sessionId` | Get session status |
| POST | `/api/pairing/send/:sessionId` | Send message |
| POST | `/api/pairing/send-bulk/:sessionId` | Send bulk messages |
| DELETE | `/api/pairing/session/:sessionId` | Delete session |
| GET | `/api/pairing/sessions` | List all sessions |
| POST | `/api/pairing/restart/:sessionId` | Restart session |
| GET | `/api/pairing/health` | Health check |

## Webhook Events

All events are sent to `BASE_WEBHOOK_URL` with the following format:

```json
{
  "event": "message|status|pairing_code|error",
  "sessionId": "SESSION001",
  "timestamp": "2025-11-19T00:00:00.000Z",
  "data": {
    ...
  }
}
```

**Event Types:**
- `pairing_code` - Pairing code generated
- `status` - Session status changed
- `message` - Message received
- `error` - Error occurred

## License

MIT
