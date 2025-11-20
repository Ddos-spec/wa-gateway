const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

/**
 * @route   POST /api/auth/qr
 * @desc    Start QR code authentication for a session
 * @access  Public
 */
router.post('/qr', authController.startQRAuth);

/**
 * @route   POST /api/auth/phone
 * @desc    Start phone number authentication for a session
 * @access  Public
 */
router.post('/phone', authController.startPhoneAuth);

module.exports = router;
