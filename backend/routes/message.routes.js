const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message.controller');

/**
 * @route   POST /api/message/send
 * @desc    Send WhatsApp message
 * @access  Public
 */
router.post('/send', messageController.sendMessage);

/**
 * @route   GET /api/message/history
 * @desc    Get message history
 * @access  Public
 */
router.get('/history', messageController.getHistory);

module.exports = router;
