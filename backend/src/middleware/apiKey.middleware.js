const logger = require('../utils/logger');

const apiKeyMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    logger.warn('API_KEY not configured in environment variables');
    return next();
  }

  if (!apiKey) {
    logger.warn('API request without API key');
    return res.status(401).json({
      error: 'API key is required',
      message: 'Please provide x-api-key header',
    });
  }

  if (apiKey !== expectedApiKey) {
    logger.warn(`Invalid API key attempt: ${apiKey.substring(0, 8)}...`);
    return res.status(401).json({
      error: 'Invalid API key',
      message: 'The provided API key is not valid',
    });
  }

  next();
};

module.exports = apiKeyMiddleware;
