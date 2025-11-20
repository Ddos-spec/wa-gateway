const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/session.controller');

/**
 * @route   GET /api/session/status
 * @desc    Get all active sessions status
 * @access  Public
 */
router.get('/status', sessionController.getStatus);

/**
 * @route   GET /api/session/contacts
 * @desc    Get contacts for a session
 * @access  Public
 */
router.get('/contacts', sessionController.getContacts);

module.exports = router;
