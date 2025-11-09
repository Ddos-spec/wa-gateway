# WA Gateway Redis Configuration Guide

This document provides configuration guidance for Redis 4+ with socket connections.

## Environment Variables

The following environment variables should be set in your `.env` file:

```
REDIS_HOST=postgres_redis
REDIS_PORT=6379
REDIS_PASSWORD=b5cf82712e2201393c9e
```

## Docker Configuration

If you're using Docker and your Redis container is named `postgres_redis`, make sure:

1. Both containers are on the same Docker network
2. The Redis container is running and accessible
3. The Redis password matches what's in your environment

## Troubleshooting

If you're experiencing issues with authentication (stuck at CREATING/CONNECTING):

1. Verify Redis server is running: `docker ps | grep redis`
2. Test connection manually: `docker exec -it your_app_container redis-cli -h postgres_redis -p 6379 ping`
3. Check logs for detailed error messages

## Changes Made

The following improvements were implemented:

1. Enhanced Redis connection handling with retry strategies
2. Better error messages for connection failures
3. Improved timeout values for WA connection
4. Enhanced error handling in session deletion
5. Improved dashboard deletion function with better error feedback

## Restart Required

After making changes to environment variables, restart the WA Gateway application.