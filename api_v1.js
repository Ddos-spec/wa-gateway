const express = require('express');
const { jidNormalizedUser, downloadMediaMessage, getContentType } = require('@whiskeysockets/baileys');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csurf = require('csurf');
const validator = require('validator');
const { formatPhoneNumber, toWhatsAppFormat, isValidPhoneNumber } = require('./phone-utils');
// Remove: const { log } = require('./index');

const router = express.Router();
const MAX_MESSAGES_PER_BATCH = parseInt(process.env.MAX_MESSAGES_PER_BATCH || '50', 10);

// Webhook URLs will be stored in Redis by default
let redisClient = null;
const webhookUrls = new Map(); // fallback in-memory storage

// Function to set Redis client if available
function setRedisClient(client) {
  redisClient = client;
}

async function getWebhookUrl(sessionId) {
  if (redisClient) {
    try {
      const url = await redisClient.get(`webhook:url:${sessionId}`);
      if (url) return url;
    } catch (error) {
      console.error('Redis error in getWebhookUrl, falling back to in-memory:', error.message);
    }
  }
  // Fallback to in-memory map
  return webhookUrls.get(sessionId) || process.env.WEBHOOK_URL || '';
}

async function setWebhookUrl(sessionId, url) {
  if (redisClient) {
    try {
      if (url) {
        await redisClient.setEx(`webhook:url:${sessionId}`, 86400 * 30, url); // 30 days TTL
      } else {
        await redisClient.del(`webhook:url:${sessionId}`);
      }
      return true;
    } catch (error) {
      console.error('Redis error in setWebhookUrl, falling back to in-memory:', error.message);
    }
  }
  // Fallback to in-memory map
  if (url) {
    webhookUrls.set(sessionId, url);
  } else {
    webhookUrls.delete(sessionId);
  }
  return false;
}

async function deleteWebhookUrl(sessionId) {
  if (redisClient) {
    try {
      await redisClient.del(`webhook:url:${sessionId}`);
      return true;
    } catch (error) {
      console.error('Redis error in deleteWebhookUrl, falling back to in-memory:', error.message);
    }
  }
  // Fallback to in-memory map
  webhookUrls.delete(sessionId);
  return false;
}

// Multer setup for file uploads
const mediaDir = path.join(__dirname, 'media');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, mediaDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${randomUUID()}${ext}`);
    }
});
const upload = multer({ storage });

function initializeApi(
    sessions,
    sessionTokens,
    createSession,
    getSessionsDetails,
    deleteSession,
    log,
    phonePairing,
    saveSessionSettings,
    regenerateSessionToken,
    redisClient,
    scheduleMessageSend,
    validateWhatsAppRecipient
) {
    // Mocks for removed functionality
    const checkAndStartScheduledCampaigns = async () => ({ status: 'success', message: 'Campaigns disabled' });
    const campaignManager = {
        getAllCampaigns: () => [],
        loadCampaign: () => null,
        cloneCampaign: () => ({}),
        exportResults: () => '',
        parseCSV: () => []
    };
    const campaignSender = {
        startCampaign: async () => ({}),
        resumeCampaign: async () => ({}),
        retryFailed: async () => ({}),
        getCampaignStatus: () => null
    };
    const recipientListManager = {
        getAllLists: () => [],
        loadList: () => null,
        createList: () => ({}),
        updateList: () => ({}),
        deleteList: () => true,
        cloneList: () => ({}),
        addRecipient: () => ({}),
        updateRecipient: () => ({}),
        removeRecipient: () => ({}),
        searchRecipients: () => [],
        getStatistics: () => ({}),
        markAsUsed: () => {}
    };

    if (redisClient) {
        setRedisClient(redisClient);
    }

    // Security middlewares
    router.use(helmet());
    
    // More lenient rate limiter for authenticated dashboard requests
    const apiLimiter = rateLimit({
        windowMs: 1 * 60 * 1000,
        max: 100, // Increased from 30 to 100 requests per minute
        message: { status: 'error', message: 'Too many requests, please try again later.' },
        skip: (req) => {
            // Skip rate limiting for authenticated admin users
            return req.session && req.session.adminAuthed;
        },
        // Trust proxy headers for proper IP detection
        trustProxy: true,
        standardHeaders: true,
        legacyHeaders: false
    });
    
    router.use(apiLimiter);
    // CSRF protection for dashboard and sensitive endpoints (not for API clients)
    // router.use(csurf()); // Uncomment if you want CSRF for all POST/DELETE

    const validateToken = (req, res, next) => {
        // Support 'apikey' header (User preference) OR 'authorization'
        let token = req.headers['apikey'] || req.headers['authorization'];
        
        // Support "Bearer <token>" and raw "<token>"
        if (token) {
            if (token.startsWith('Bearer ')) {
                token = token.slice(7);
            }
            token = token.trim();
        }

        if (!token) {
            return res.status(401).json({ status: 'error', message: 'No token provided' });
        }
        
        let sessionId = req.query.sessionId || req.body.sessionId || req.params.sessionId;
        
        // Infer sessionId from token if not provided
        if (!sessionId) {
            for (const [id, t] of sessionTokens.entries()) {
                if (t === token) {
                    sessionId = id;
                    req.sessionId = id; // Secure injection
                    req.query.sessionId = id; // Legacy injection
                    break;
                }
            }
        }

        // If still no sessionId (and it's required for the route), we can't validate specific ownership yet
        // but we can check if the token exists globally.
        
        if (sessionId) {
            const expectedToken = sessionTokens.get(sessionId);
            if (expectedToken && token === expectedToken) {
                req.sessionId = sessionId; // Ensure set
                return next();
            }
             return res.status(403).json({ status: 'error', message: `Invalid token for session ${sessionId}` });
        }
        
        // Global token check (if session not targeted yet)
        const isAnyTokenValid = Array.from(sessionTokens.values()).includes(token);
        if (isAnyTokenValid) {
            return next();
        }

        return res.status(403).json({ status: 'error', message: 'Invalid token' });
    };

    // Unprotected routes
    router.post('/sessions', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        
        // Get current user from session
        const currentUser = req.session && req.session.adminAuthed ? {
            email: req.session.userEmail,
            role: req.session.userRole
        } : null;
        
        // Check if user is authenticated or has master API key
        if (!currentUser) {
            const masterKey = req.headers['x-master-key'];
            const requiredMasterKey = process.env.MASTER_API_KEY;
            
            if (requiredMasterKey && masterKey !== requiredMasterKey) {
                log('Unauthorized session creation attempt', 'SYSTEM', { 
                    event: 'auth-failed', 
                    endpoint: req.originalUrl,
                    ip: req.ip 
                });
                return res.status(401).json({ 
                    status: 'error', 
                    message: 'Master API key required for session creation' 
                });
            }
        }
        
        const { sessionId } = req.body;
        if (!sessionId) {
            log('API error', 'SYSTEM', { event: 'api-error', error: 'sessionId is required', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'sessionId is required' });
        }
        
        // Convert spaces to underscores
        const sanitizedSessionId = sessionId.trim().replace(/\s+/g, '_');
        
        try {
            // Pass the creator email to createSession
            const creatorEmail = currentUser ? currentUser.email : null;
            await createSession(sanitizedSessionId, creatorEmail);
            const token = sessionTokens.get(sanitizedSessionId);
            
            // Log activity removed
            
            log('Session created', sanitizedSessionId, {
                event: 'session-created',
                sessionId: sanitizedSessionId,
                createdBy: currentUser ? currentUser.email : 'api-key'
            });
            res.status(201).json({
                status: 'success',
                message: `Session ${sanitizedSessionId} created.`,
                sessionId: sanitizedSessionId,
                token: token
            });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            if (error.message === 'Session already exists') {
                return res.status(409).json({ status: 'error', message: 'Session already exists' });
            }
            res.status(500).json({ status: 'error', message: `Failed to create session: ${error.message}` });
        }
    });

    router.get('/sessions', (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl });
        
        // Get current user from session
        const currentUser = req.session && req.session.adminAuthed ? {
            email: req.session.userEmail,
            role: req.session.userRole
        } : null;
        
        if (currentUser) {
            // If authenticated, filter sessions based on role
            res.status(200).json(getSessionsDetails(currentUser.email, currentUser.role === 'admin'));
        } else {
            // For API access without authentication, show all sessions (backward compatibility)
            res.status(200).json(getSessionsDetails());
        }
    });

    // Campaign functionality removed per user request
    
    // Middleware to check campaign access (session-based)
    const checkAuth = async (req, res, next) => {
        const currentUser = req.session && req.session.adminAuthed ? {
            email: req.session.userEmail,
            role: req.session.userRole
        } : null;
        
        if (!currentUser) {
            return res.status(401).json({ status: 'error', message: 'Authentication required' });
        }
        
        req.currentUser = currentUser;
        next();
    };
    const checkCampaignAccess = checkAuth;
    

    
// Function checkAndStartScheduledCampaigns Removed

    router.get('/campaigns/csv-template', checkCampaignAccess, (req, res) => {
        const csvContent = `WhatsApp Number,Name,Job Title,Company Name
+1234567890,John Doe,Sales Manager,ABC Corporation
+0987654321,Jane Smith,Marketing Director,XYZ Company
+1122334455,Bob Johnson,CEO,Startup Inc
+5544332211,Alice Brown,CTO,Tech Solutions
+9988776655,Charlie Davis,Product Manager,Innovation Labs`;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="whatsapp_campaign_template.csv"');
        res.send(csvContent);
    });

    // Manual trigger endpoint for checking scheduled campaigns (MUST be before /:id route)
    router.get('/campaigns/check-scheduled', checkCampaignAccess, async (req, res) => {
        console.log('🔍 Manual scheduler check triggered by:', req.currentUser.email);
        try {
            const result = await checkAndStartScheduledCampaigns();
            res.json({
                status: 'success',
                message: 'Scheduler check completed',
                ...result
            });
        } catch (error) {
            res.status(500).json({ 
                status: 'error', 
                message: error.message 
            });
        }
    });

    // Endpoint to get campaigns that should have been started but are still in ready status (MUST be before /:id route)
    router.get('/campaigns/overdue', checkCampaignAccess, (req, res) => {
        try {
            if (!campaignManager) {
                return res.status(503).json({ error: 'Campaign manager not initialized' });
            }
            
            const now = new Date();
            const campaigns = campaignManager.getAllCampaigns();
            
            const overdueCampaigns = campaigns.filter(campaign => {
                return (
                    campaign.status === 'ready' && 
                    campaign.scheduledAt && 
                    new Date(campaign.scheduledAt) <= now
                );
            });
            
            res.json({
                totalCampaigns: campaigns.length,
                overdueCampaigns: overdueCampaigns.length,
                campaigns: overdueCampaigns.map(c => ({
                    id: c.id,
                    name: c.name,
                    status: c.status,
                    scheduledAt: c.scheduledAt,
                    createdAt: c.createdAt,
                    minutesOverdue: Math.floor((now - new Date(c.scheduledAt)) / 60000)
                }))
            });
            
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
// Route removed
    
// Route removed
    
// Route removed
    
// Route removed
    
    router.post('/campaigns/:id/clone', checkCampaignAccess, async (req, res) => {
        try {
            const cloned = campaignManager.cloneCampaign(req.params.id, req.currentUser.email);
            res.status(201).json(cloned);
        } catch (error) {
            res.status(400).json({ status: 'error', message: error.message });
        }
    });
    
    router.post('/campaigns/:id/send', checkCampaignAccess, async (req, res) => {
        try {
            const result = await campaignSender.startCampaign(req.params.id, req.currentUser.email);
            res.json(result);
        } catch (error) {
            res.status(400).json({ status: 'error', message: error.message });
        }
    });
    
// Route removed
    
    router.post('/campaigns/:id/resume', checkCampaignAccess, async (req, res) => {
        try {
            const result = await campaignSender.resumeCampaign(req.params.id, req.currentUser.email);
            res.json({ status: 'success', message: 'Campaign resumed' });
        } catch (error) {
            res.status(400).json({ status: 'error', message: error.message });
        }
    });
    
    router.post('/campaigns/:id/retry', checkCampaignAccess, async (req, res) => {
        try {
            const result = await campaignSender.retryFailed(req.params.id, req.currentUser.email);
            res.json(result);
        } catch (error) {
            res.status(400).json({ status: 'error', message: error.message });
        }
    });
    
    router.get('/campaigns/:id/status', checkCampaignAccess, (req, res) => {
        const status = campaignSender.getCampaignStatus(req.params.id);
        if (!status) {
            return res.status(404).json({ status: 'error', message: 'Campaign not found' });
        }
        res.json(status);
    });
    
    router.get('/campaigns/:id/export', checkCampaignAccess, (req, res) => {
        const campaign = campaignManager.loadCampaign(req.params.id);
        if (!campaign) {
            return res.status(404).json({ status: 'error', message: 'Campaign not found' });
        }
        
        // Check access
        if (req.currentUser.role !== 'admin' && campaign.createdBy !== req.currentUser.email) {
            return res.status(403).json({ status: 'error', message: 'Access denied' });
        }
        
        const csv = campaignManager.exportResults(req.params.id);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${campaign.name}_results.csv"`);
        res.send(csv);
    });
    
    router.post('/campaigns/preview-csv', checkCampaignAccess, upload.single('file'), (req, res) => {
        if (!req.file) {
            return res.status(400).json({ status: 'error', message: 'No file uploaded' });
        }
        
        try {
            const csvContent = fs.readFileSync(req.file.path, 'utf-8');
            const result = campaignManager.parseCSV(csvContent);
            
            // Clean up uploaded file
            fs.unlinkSync(req.file.path);
            
            res.json(result);
        } catch (error) {
            // Clean up uploaded file
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            res.status(400).json({ status: 'error', message: error.message });
        }
    });



    // Export the function for use by the main scheduler
    router.checkAndStartScheduledCampaigns = checkAndStartScheduledCampaigns;

    // Recipient List Management Endpoints (Session-based auth, not token-based)
    
    // Get all recipient lists
    router.get('/recipient-lists', checkCampaignAccess, (req, res) => {
        const lists = recipientListManager.getAllLists(
            req.currentUser.email,
            req.currentUser.role === 'admin'
        );
        res.json(lists);
    });
    
    // Get specific recipient list
    router.get('/recipient-lists/:id', checkCampaignAccess, (req, res) => {
        const list = recipientListManager.loadList(req.params.id);
        if (!list) {
            return res.status(404).json({ status: 'error', message: 'Recipient list not found' });
        }
        
        // Check access
        if (req.currentUser.role !== 'admin' && list.createdBy !== req.currentUser.email) {
            return res.status(403).json({ status: 'error', message: 'Access denied' });
        }
        
        res.json(list);
    });
    
    // Create new recipient list
    router.post('/recipient-lists', checkCampaignAccess, (req, res) => {
        try {
            const listData = {
                ...req.body,
                createdBy: req.currentUser.email
            };
            
            const list = recipientListManager.createList(listData);
            res.status(201).json(list);
        } catch (error) {
            res.status(400).json({ status: 'error', message: error.message });
        }
    });
    
    // Update recipient list
    router.put('/recipient-lists/:id', checkCampaignAccess, (req, res) => {
        try {
            const list = recipientListManager.loadList(req.params.id);
            if (!list) {
                return res.status(404).json({ status: 'error', message: 'Recipient list not found' });
            }
            
            // Check access
            if (req.currentUser.role !== 'admin' && list.createdBy !== req.currentUser.email) {
                return res.status(403).json({ status: 'error', message: 'Access denied' });
            }
            
            const updated = recipientListManager.updateList(req.params.id, req.body);
            res.json(updated);
        } catch (error) {
            res.status(400).json({ status: 'error', message: error.message });
        }
    });
    
    // Delete recipient list
    router.delete('/recipient-lists/:id', checkCampaignAccess, (req, res) => {
        const list = recipientListManager.loadList(req.params.id);
        if (!list) {
            return res.status(404).json({ status: 'error', message: 'Recipient list not found' });
        }
        
        // Check access
        if (req.currentUser.role !== 'admin' && list.createdBy !== req.currentUser.email) {
            return res.status(403).json({ status: 'error', message: 'Access denied' });
        }
        
        const success = recipientListManager.deleteList(req.params.id);
        if (success) {
            res.json({ status: 'success', message: 'Recipient list deleted' });
        } else {
            res.status(500).json({ status: 'error', message: 'Failed to delete recipient list' });
        }
    });
    
    // Clone recipient list
    router.post('/recipient-lists/:id/clone', checkCampaignAccess, (req, res) => {
        try {
            const cloned = recipientListManager.cloneList(req.params.id, req.currentUser.email, req.body.name);
            res.status(201).json(cloned);
        } catch (error) {
            res.status(400).json({ status: 'error', message: error.message });
        }
    });
    
    // Add recipient to list
    router.post('/recipient-lists/:id/recipients', checkCampaignAccess, (req, res) => {
        try {
            const list = recipientListManager.loadList(req.params.id);
            if (!list) {
                return res.status(404).json({ status: 'error', message: 'Recipient list not found' });
            }
            
            // Check access
            if (req.currentUser.role !== 'admin' && list.createdBy !== req.currentUser.email) {
                return res.status(403).json({ status: 'error', message: 'Access denied' });
            }
            
            const updated = recipientListManager.addRecipient(req.params.id, req.body);
            res.status(201).json(updated);
        } catch (error) {
            res.status(400).json({ status: 'error', message: error.message });
        }
    });
    
    // Update recipient in list
    router.put('/recipient-lists/:id/recipients/:number', checkCampaignAccess, (req, res) => {
        try {
            const list = recipientListManager.loadList(req.params.id);
            if (!list) {
                return res.status(404).json({ status: 'error', message: 'Recipient list not found' });
            }
            
            // Check access
            if (req.currentUser.role !== 'admin' && list.createdBy !== req.currentUser.email) {
                return res.status(403).json({ status: 'error', message: 'Access denied' });
            }
            
            const updated = recipientListManager.updateRecipient(req.params.id, req.params.number, req.body);
            res.json(updated);
        } catch (error) {
            res.status(400).json({ status: 'error', message: error.message });
        }
    });
    
    // Remove recipient from list
    router.delete('/recipient-lists/:id/recipients/:number', checkCampaignAccess, (req, res) => {
        try {
            const list = recipientListManager.loadList(req.params.id);
            if (!list) {
                return res.status(404).json({ status: 'error', message: 'Recipient list not found' });
            }
            
            // Check access
            if (req.currentUser.role !== 'admin' && list.createdBy !== req.currentUser.email) {
                return res.status(403).json({ status: 'error', message: 'Access denied' });
            }
            
            const updated = recipientListManager.removeRecipient(req.params.id, req.params.number);
            res.json(updated);
        } catch (error) {
            res.status(400).json({ status: 'error', message: error.message });
        }
    });
    
    // Search recipients across all lists
    router.get('/recipient-lists/search/:query', checkCampaignAccess, (req, res) => {
        const results = recipientListManager.searchRecipients(
            req.params.query,
            req.currentUser.email,
            req.currentUser.role === 'admin'
        );
        res.json(results);
    });
    
    // Get recipient lists statistics
    router.get('/recipient-lists-stats', checkCampaignAccess, (req, res) => {
        const stats = recipientListManager.getStatistics(
            req.currentUser.email,
            req.currentUser.role === 'admin'
        );
        res.json(stats);
    });
    
    // Mark recipient list as used
    router.post('/recipient-lists/:id/mark-used', checkCampaignAccess, (req, res) => {
        const list = recipientListManager.loadList(req.params.id);
        if (!list) {
            return res.status(404).json({ status: 'error', message: 'Recipient list not found' });
        }
        
        // Check access
        if (req.currentUser.role !== 'admin' && list.createdBy !== req.currentUser.email) {
            return res.status(403).json({ status: 'error', message: 'Access denied' });
        }
        
        recipientListManager.markAsUsed(req.params.id);
        res.json({ status: 'success', message: 'List marked as used' });
    });
    
    // Debug endpoint to check session status
    router.get('/debug/sessions', checkCampaignAccess, (req, res) => {
        const debugInfo = {};
        sessions.forEach((session, sessionId) => {
            debugInfo[sessionId] = {
                status: session.status,
                hasSock: !!session.sock,
                sockConnected: session.sock ? 'yes' : 'no',
                owner: session.owner,
                detail: session.detail
            };
        });
        res.json(debugInfo);
    });

    // Official WhatsApp Phone Pairing Endpoint
    router.post('/session/pair-phone', checkAuth, async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        const { phoneNumber, sessionId: customSessionId } = req.body;
        const currentUser = req.currentUser;

        if (!phoneNumber) {
            return res.status(400).json({
                status: 'error',
                message: 'phoneNumber is required'
            });
        }

        // Validate phone number format
        if (!isValidPhoneNumber(phoneNumber)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid phone number format. Use international format (e.g., 628123456789)'
            });
        }

        try {
            // If customSessionId is provided, we prioritize checking that specific session
            if (customSessionId) {
                 // Check if session already exists in main sessions
                 if (sessions.has(customSessionId)) {
                     // If it exists but is not connected, maybe we can reuse?
                     // But simpler to ask user to delete or use different name.
                     // However, for retry logic, we might want to allow overwrite if it's the SAME number.
                     // For now, let's keep it strict to avoid confusion.
                     const existing = sessions.get(customSessionId);
                     if (existing.status === 'CONNECTED') {
                         return res.status(409).json({
                            status: 'error',
                            message: `Session ${customSessionId} is already connected.`
                         });
                     }
                     // If exists but not connected, we clean it up to start fresh pairing
                     log(`Cleaning up existing session ${customSessionId} for new pairing request.`, customSessionId);
                     await deleteSession(customSessionId);
                     phonePairing.deletePairing(customSessionId);
                 }
            } else {
                // Only if no custom ID, we look for stale auto-generated sessions
                const stalePairing = phonePairing.findStalePairing(phoneNumber);
                if (stalePairing && stalePairing.sessionId) {
                    const staleSessionId = stalePairing.sessionId;
                    log(`Deleting stale pairing session ${staleSessionId} for number ${phoneNumber}.`, 'SYSTEM');
                    await deleteSession(staleSessionId); // Deletes auth folder & main session
                    phonePairing.deletePairing(staleSessionId); // Deletes from pairing_statuses.json
                }
            }

            const { sessionId } = await phonePairing.createPairing(currentUser.email, phoneNumber, customSessionId);

            // This will create a session and start the connection process
            // The connectToWhatsApp function will see the PENDING_REQUEST and handle pairing
            await createSession(sessionId, currentUser.email);

            res.status(202).json({
                status: 'success',
                message: 'Pairing process initiated. Please check the session status for updates.',
                sessionId: sessionId
            });

        } catch (error) {
            log('Phone pairing error', 'SYSTEM', {
                event: 'phone-pair-error',
                error: error.message,
                endpoint: req.originalUrl,
                phoneNumber: phoneNumber
            });

            res.status(500).json({
                status: 'error',
                message: 'Failed to initiate pairing. Please try again.'
            });
        }
    });

    // Endpoint to check pairing status
    router.get('/session/:sessionId/pair-status', (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl });

        const { sessionId } = req.params;

        try {
            const pairingStatus = phonePairing.getPairingStatus(sessionId);

            if (!pairingStatus) {
                // Also check regular sessions for non-pairing statuses
                const regularSession = sessions.get(sessionId);
                if (regularSession) {
                    return res.status(200).json({
                        status: 'success',
                        sessionId: sessionId,
                        sessionStatus: regularSession.status,
                        detail: regularSession.detail || '',
                        phoneNumber: regularSession.phoneNumber || null,
                        pairingCode: null // No pairing code for regular sessions
                    });
                }

                return res.status(404).json({
                    status: 'error',
                    message: 'Session or pairing request not found'
                });
            }

            res.status(200).json({
                status: 'success',
                sessionId: sessionId,
                sessionStatus: pairingStatus.status,
                detail: pairingStatus.detail || '',
                phoneNumber: pairingStatus.phoneNumber || null,
                pairingCode: pairingStatus.pairingCode || null
            });

        } catch (error) {
            log('Pair status check error', 'SYSTEM', {
                event: 'pair-status-error',
                error: error.message,
                endpoint: req.originalUrl,
                sessionId
            });

            res.status(500).json({
                status: 'error',
                message: 'Failed to check pairing status'
            });
        }
    });

    // QR Code regeneration endpoint (must be before validateToken middleware)
    router.get('/sessions/:sessionId/qr', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl });

        const { sessionId } = req.params;
        const session = sessions.get(sessionId);

        // If session doesn't exist in memory, we still might want to clean up file system/pairing to be safe
        // But standard logic requires session to exist to get owner? 
        // Let's proceed even if session missing, defaulting owner to null (or current user if we had auth)

        log(`QR code regeneration requested for ${sessionId}`, sessionId);

        try {
            // 0. Force clear any phone pairing status to allow switching modes
            if (phonePairing) {
                await phonePairing.deletePairing(sessionId);
            }

            // 1. Get session owner info before deletion
            const sessionOwner = session ? session.owner : null;

            // 2. Delete auth folder to force fresh QR generation
            const sessionDir = path.join(__dirname, 'auth_info_baileys', sessionId);
            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
                log(`Cleared auth data for ${sessionId} to force QR regeneration`, sessionId);
            }

            // 3. Delete the current session (if it exists)
            if (sessions.has(sessionId)) {
                await deleteSession(sessionId);
            }

            // 4. Recreate the session (this will trigger fresh connection and QR generation)
            await createSession(sessionId, sessionOwner);

            log(`QR code regeneration initiated for ${sessionId}`, sessionId);
            res.status(200).json({
                status: 'success',
                message: 'QR code regeneration initiated. Please wait for the QR code to appear.'
            });
        } catch (error) {
            log(`Error regenerating QR for ${sessionId}: ${error.message}`, sessionId, { error });
            res.status(500).json({
                status: 'error',
                message: 'Failed to regenerate QR code. Please try again.'
            });
        }
    });

    // All routes below this are protected by token
    router.use(validateToken);

    router.post('/sessions/:sessionId/generate-token', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        const { sessionId } = req.params;

        // Get current user from session
        const currentUser = req.session && req.session.adminAuthed ? {
            email: req.session.userEmail,
            role: req.session.userRole
        } : null;

        try {
             // Check ownership if user is authenticated
            if (currentUser && currentUser.role !== 'admin') {
                const session = sessions.get(sessionId);
                if (session && session.owner && session.owner !== currentUser.email) {
                    return res.status(403).json({ status: 'error', message: 'Access denied' });
                }
            }

            const newToken = await regenerateSessionToken(sessionId);
            res.status(200).json({ status: 'success', message: 'Token regenerated successfully.', token: newToken });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            res.status(500).json({ status: 'error', message: `Failed to regenerate token: ${error.message}` });
        }
    });

    router.post('/sessions/:sessionId/settings', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        const { sessionId } = req.params;
        const settings = req.body;

        if (typeof settings !== 'object' || settings === null) {
            return res.status(400).json({ status: 'error', message: 'Invalid settings format. Expected an object.' });
        }

        try {
            await saveSessionSettings(sessionId, settings);
            res.status(200).json({ status: 'success', message: 'Settings saved successfully.' });
        } catch (error) {
            log(`API Error saving settings for ${sessionId}: ${error.message}`, 'SYSTEM', { error });
            res.status(500).json({ status: 'error', message: 'Failed to save settings.' });
        }
    });

    router.delete('/sessions/:sessionId', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, params: req.params });
        const { sessionId } = req.params;
        
        // Get current user from session
        const currentUser = req.session && req.session.adminAuthed ? {
            email: req.session.userEmail,
            role: req.session.userRole
        } : null;
        
        try {
            // Check ownership if user is authenticated
            if (currentUser && currentUser.role !== 'admin' && userManager) {
                const sessionOwner = userManager.getSessionOwner(sessionId);
                if (sessionOwner && sessionOwner.email !== currentUser.email) {
                    return res.status(403).json({ 
                        status: 'error', 
                        message: 'You can only delete your own sessions' 
                    });
                }
            }
            
            await deleteSession(sessionId);
            
            // Log activity
                    // Log session delete removed            
            log('Session deleted', sessionId, { event: 'session-deleted', sessionId });
            res.status(200).json({ status: 'success', message: `Session ${sessionId} deleted.` });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            res.status(500).json({ status: 'error', message: `Failed to delete session: ${error.message}` });
        }
    });

    async function sendMessage(sock, to, message) {
        try {
            const jid = jidNormalizedUser(to);
            const result = await sock.sendMessage(jid, message);
            return { status: 'success', message: `Message sent to ${to}`, messageId: result.key.id };
        } catch (error) {
            console.error(`Failed to send message to ${to}:`, error);
            return { status: 'error', message: `Failed to send message to ${to}. Reason: ${error.message}` };
        }
    }

    // Webhook setup endpoint
    router.post('/webhook', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        const { url, sessionId } = req.body;
        if (!url || !sessionId) {
            log('API error', 'SYSTEM', { event: 'api-error', error: 'URL and sessionId are required.', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'URL and sessionId are required.' });
        }
        await setWebhookUrl(sessionId, url);
        log('Webhook URL updated', url, { event: 'webhook-updated', sessionId, url });
        res.status(200).json({ status: 'success', message: `Webhook URL for session ${sessionId} updated to ${url}` });
    });
    
    // Add GET and DELETE endpoints for webhook management
    router.get('/webhook', async (req, res) => {
        const { sessionId } = req.query;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'sessionId is required.' });
        }
        const url = await getWebhookUrl(sessionId);
        res.status(200).json({ status: 'success', sessionId, url: url || null });
    });

    router.delete('/webhook', async (req, res) => {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'sessionId is required.' });
        }
        await deleteWebhookUrl(sessionId);
        log('Webhook URL deleted', '', { event: 'webhook-deleted', sessionId });
        res.status(200).json({ status: 'success', message: `Webhook for session ${sessionId} deleted.` });
    });

    // Hardened media upload endpoint
    router.post('/media', upload.single('file'), (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        if (!req.file) {
            log('API error', 'SYSTEM', { event: 'api-error', error: 'No file uploaded.', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'No file uploaded.' });
        }
        // Restrict file type and size
        const allowedTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            // Audio types
            'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg', 'audio/wav',
            'audio/x-wav', 'audio/webm', 'audio/aac', 'audio/opus',
            // Video types
            'video/mp4', 'video/3gpp', 'video/quicktime', 'video/webm',
            // Sticker types
            'image/webp'
        ];
        if (!allowedTypes.includes(req.file.mimetype)) {
            fs.unlinkSync(req.file.path);
            log('API error', 'SYSTEM', { event: 'api-error', error: 'Invalid file type.', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'Invalid file type. Allowed: Images (JPEG, PNG, GIF, WebP), Audio (MP3, MP4, OGG, WAV, WebM, AAC, Opus), Video (MP4, 3GPP, QuickTime, WebM), Documents (PDF, DOC, DOCX, XLS, XLSX).' });
        }
        if (req.file.size > 25 * 1024 * 1024) { // 25MB
            fs.unlinkSync(req.file.path);
            log('API error', 'SYSTEM', { event: 'api-error', error: 'File too large.', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'File too large. Max 25MB.' });
        }
        const mediaId = req.file.filename;
        log('File uploaded', mediaId, { event: 'file-uploaded', mediaId });
        res.status(201).json({
            status: 'success',
            message: 'File uploaded successfully.',
            mediaId: mediaId,
            url: `/media/${mediaId}`
        });
    });

    // Main message sending endpoint handler
    const handleSendMessage = async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, query: req.query });

        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        if (!sessionId) {
            log('API error', 'SYSTEM', { event: 'api-error', error: 'sessionId could not be determined', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'sessionId is required (in query, body, or implied by token)' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            log('API error', 'SYSTEM', { event: 'api-error', error: `Session ${sessionId} not found or not connected.`, endpoint: req.originalUrl });
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        let payload = [];
        if (Array.isArray(req.body)) {
            payload = req.body;
        } else if (Array.isArray(req.body.messages)) {
            payload = req.body.messages;
        } else {
            payload = [req.body];
        }
        const messages = payload.filter((msg) => msg && typeof msg === 'object');

        if (messages.length === 0) {
            return res.status(400).json({ status: 'error', message: 'No message payload provided.' });
        }
        if (messages.length > MAX_MESSAGES_PER_BATCH) {
            return res.status(400).json({
                status: 'error',
                message: `Batch limit exceeded. Max ${MAX_MESSAGES_PER_BATCH} messages per request.`
            });
        }

        const responseSlots = [];
        const phoneNumbers = [];
        const messageContents = [];

        for (const rawMessage of messages) {
            const msg = { ...rawMessage };
            if (!msg.to && (msg.receiver || msg.number)) {
                msg.to = msg.receiver || msg.number;
            }
            if (!msg.type && msg.mtype) {
                msg.type = msg.mtype;
            }
            if (!msg.type && msg.message) {
                msg.type = 'text';
            }
            if (msg.type === 'text' && !msg.text && msg.message) {
                msg.text = { body: msg.message };
            }

            const { recipient_type, to, type, text, image, document } = msg;
            if (!to || !type) {
                responseSlots.push(Promise.resolve({ status: 'error', message: 'Invalid message format. "to" and "type" are required.' }));
                continue;
            }

            let formattedNumber = to;
            let destination = to;
            const isGroup = recipient_type === 'group' || to.endsWith('@g.us');
            if (!isGroup) {
                formattedNumber = formatPhoneNumber(to);
                if (!/^\d+$/.test(formattedNumber)) {
                    responseSlots.push(Promise.resolve({ status: 'error', message: 'Invalid recipient format.' }));
                    continue;
                }
                destination = toWhatsAppFormat(formattedNumber);
            } else {
                destination = to.endsWith('@g.us') ? to : `${to}@g.us`;
            }

            const messageContent = { type, to };
            if (type === 'text') {
                if (!text || typeof text.body !== 'string' || text.body.length === 0 || text.body.length > 4096) {
                    responseSlots.push(Promise.resolve({ status: 'error', message: 'Invalid text message content.' }));
                    continue;
                }
                messageContent.text = text.body;
            }
            if (type === 'image' && image) {
                if (image.id && !validator.isAlphanumeric(image.id.replace(/[\.\-]/g, ''))) {
                    responseSlots.push(Promise.resolve({ status: 'error', message: 'Invalid image ID.' }));
                    continue;
                }
                if (image.link && !validator.isURL(image.link)) {
                    responseSlots.push(Promise.resolve({ status: 'error', message: 'Invalid image URL.' }));
                    continue;
                }
                messageContent.image = {
                    caption: image.caption || '',
                    url: image.link || `/media/${image.id}`
                };
            }
            if (type === 'document' && document) {
                if (document.id && !validator.isAlphanumeric(document.id.replace(/[\.\-]/g, ''))) {
                    responseSlots.push(Promise.resolve({ status: 'error', message: 'Invalid document ID.' }));
                    continue;
                }
                if (document.link && !validator.isURL(document.link)) {
                    responseSlots.push(Promise.resolve({ status: 'error', message: 'Invalid document URL.' }));
                    continue;
                }
                messageContent.document = {
                    filename: document.filename || 'document',
                    url: document.link || `/media/${document.id}`
                };
            }
            if (type === 'video' && msg.video) {
                messageContent.video = {
                    caption: msg.video.caption || '',
                    url: msg.video.link || (msg.video.id ? `/media/${msg.video.id}` : null)
                };
            }

            let messagePayload;
            try {
                switch (type) {
                    case 'text': {
                        if (!text || !text.body) {
                            throw new Error('For "text" type, "text.body" is required.');
                        }
                        messagePayload = { text: text.body };
                        break;
                    }
                    case 'image': {
                        const img = msg.image;
                        if (!img || (!img.link && !img.id)) {
                            throw new Error('For "image" type, "image.link" or "image.id" is required.');
                        }
                        const imageUrl = img.id ? path.join(mediaDir, img.id) : img.link;
                        messagePayload = { image: { url: imageUrl }, caption: img.caption };
                        break;
                    }
                    case 'document': {
                        const doc = msg.document;
                        if (!doc || (!doc.link && !doc.id)) {
                            throw new Error('For "document" type, "document.link" or "document.id" is required.');
                        }
                        const docUrl = doc.id ? path.join(mediaDir, doc.id) : doc.link;
                        messagePayload = {
                            document: { url: docUrl },
                            mimetype: doc.mimetype,
                            fileName: doc.filename,
                            caption: doc.caption
                        };
                        break;
                    }
                    case 'video': {
                        const vid = msg.video;
                        if (!vid || (!vid.link && !vid.id)) {
                            throw new Error('For "video" type, "video.link" or "video.id" is required.');
                        }
                        const videoUrl = vid.id ? path.join(mediaDir, vid.id) : vid.link;
                        messagePayload = {
                            video: { url: videoUrl },
                            caption: vid.caption,
                            gifPlayback: vid.gifPlayback || false
                        };
                        break;
                    }
                    case 'audio': {
                        const aud = msg.audio;
                        if (!aud || (!aud.link && !aud.id)) {
                            throw new Error('For "audio" type, "audio.link" or "audio.id" is required.');
                        }
                        const audioUrl = aud.id ? path.join(mediaDir, aud.id) : aud.link;
                        messagePayload = {
                            audio: { url: audioUrl },
                            mimetype: aud.mimetype || 'audio/mp4',
                            ptt: aud.ptt || false // Voice note if true
                        };
                        break;
                    }
                    case 'sticker': {
                        const stk = msg.sticker;
                        if (!stk || (!stk.link && !stk.id)) {
                            throw new Error('For "sticker" type, "sticker.link" or "sticker.id" is required.');
                        }
                        const stickerUrl = stk.id ? path.join(mediaDir, stk.id) : stk.link;
                        messagePayload = {
                            sticker: { url: stickerUrl }
                        };
                        break;
                    }
                    case 'location': {
                        const loc = msg.location;
                        if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
                            throw new Error('For "location" type, "location.latitude" and "location.longitude" (numbers) are required.');
                        }
                        messagePayload = {
                            location: {
                                degreesLatitude: loc.latitude,
                                degreesLongitude: loc.longitude,
                                name: loc.name || '',
                                address: loc.address || ''
                            }
                        };
                        break;
                    }
                    case 'contact': {
                        const cnt = msg.contact;
                        if (!cnt || !cnt.name || !cnt.phone) {
                            throw new Error('For "contact" type, "contact.name" and "contact.phone" are required.');
                        }
                        const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${cnt.name}\nTEL;type=CELL;type=VOICE;waid=${cnt.phone.replace(/\D/g, '')}:${cnt.phone}\nEND:VCARD`;
                        messagePayload = {
                            contacts: {
                                displayName: cnt.name,
                                contacts: [{
                                    vcard: vcard
                                }]
                            }
                        };
                        break;
                    }
                    case 'contacts': {
                        const cnts = msg.contacts;
                        if (!cnts || !Array.isArray(cnts) || cnts.length === 0) {
                            throw new Error('For "contacts" type, "contacts" array with at least one contact is required.');
                        }
                        const vcards = cnts.map(c => ({
                            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${c.name}\nTEL;type=CELL;type=VOICE;waid=${c.phone.replace(/\D/g, '')}:${c.phone}\nEND:VCARD`
                        }));
                        messagePayload = {
                            contacts: {
                                displayName: cnts.length > 1 ? `${cnts.length} contacts` : cnts[0].name,
                                contacts: vcards
                            }
                        };
                        break;
                    }
                    case 'reaction': {
                        const react = msg.reaction;
                        if (!react || !react.messageId || !react.emoji) {
                            throw new Error('For "reaction" type, "reaction.messageId" and "reaction.emoji" are required.');
                        }
                        messagePayload = {
                            react: {
                                text: react.emoji,
                                key: {
                                    remoteJid: destination,
                                    id: react.messageId,
                                    fromMe: react.fromMe || false
                                }
                            }
                        };
                        break;
                    }
                    case 'poll': {
                        const poll = msg.poll;
                        if (!poll || !poll.name || !poll.options || !Array.isArray(poll.options) || poll.options.length < 2) {
                            throw new Error('For "poll" type, "poll.name" and "poll.options" (array with at least 2 options) are required.');
                        }
                        messagePayload = {
                            poll: {
                                name: poll.name,
                                values: poll.options,
                                selectableCount: poll.selectableCount || 1
                            }
                        };
                        break;
                    }
                    case 'button': {
                        const btn = msg.button;
                        if (!btn || !btn.text || !btn.buttons || !Array.isArray(btn.buttons)) {
                            throw new Error('For "button" type, "button.text" and "button.buttons" array are required.');
                        }
                        messagePayload = {
                            text: btn.text,
                            footer: btn.footer || '',
                            buttons: btn.buttons.map((b, i) => ({
                                buttonId: b.id || `btn_${i}`,
                                buttonText: { displayText: b.text },
                                type: 1
                            })),
                            headerType: 1
                        };
                        break;
                    }
                    case 'list': {
                        const lst = msg.list;
                        if (!lst || !lst.text || !lst.buttonText || !lst.sections || !Array.isArray(lst.sections)) {
                            throw new Error('For "list" type, "list.text", "list.buttonText", and "list.sections" array are required.');
                        }
                        messagePayload = {
                            text: lst.text,
                            footer: lst.footer || '',
                            title: lst.title || '',
                            buttonText: lst.buttonText,
                            sections: lst.sections.map(section => ({
                                title: section.title || '',
                                rows: (section.rows || []).map((row, i) => ({
                                    rowId: row.id || `row_${i}`,
                                    title: row.title,
                                    description: row.description || ''
                                }))
                            }))
                        };
                        break;
                    }
                    case 'template': {
                        const tpl = msg.template;
                        if (!tpl || !tpl.text || !tpl.buttons || !Array.isArray(tpl.buttons)) {
                            throw new Error('For "template" type, "template.text" and "template.buttons" array are required.');
                        }
                        const templateButtons = tpl.buttons.map((b, i) => {
                            if (b.type === 'url') {
                                return {
                                    index: i + 1,
                                    urlButton: {
                                        displayText: b.text,
                                        url: b.url
                                    }
                                };
                            } else if (b.type === 'call') {
                                return {
                                    index: i + 1,
                                    callButton: {
                                        displayText: b.text,
                                        phoneNumber: b.phone
                                    }
                                };
                            } else {
                                return {
                                    index: i + 1,
                                    quickReplyButton: {
                                        displayText: b.text,
                                        id: b.id || `quick_${i}`
                                    }
                                };
                            }
                        });
                        messagePayload = {
                            text: tpl.text,
                            footer: tpl.footer || '',
                            templateButtons: templateButtons
                        };
                        break;
                    }
                    default:
                        throw new Error(`Unsupported message type: ${type}`);
                }
            } catch (error) {
                responseSlots.push(Promise.resolve({ status: 'error', message: `Failed to prepare message for ${to}: ${error.message}` }));
                continue;
            }

            if (!isGroup) {
                try {
                    await validateWhatsAppRecipient(session.sock, destination, sessionId);
                } catch (error) {
                    responseSlots.push(Promise.resolve({
                        status: 'error',
                        message: `Nomor ${to} tidak terdaftar di WhatsApp.`
                    }));
                    continue;
                }
            }

            phoneNumbers.push(to);
            messageContents.push(messageContent);

            const sendPromise = scheduleMessageSend(sessionId, async () => {
                const targetSession = sessions.get(sessionId);
                if (!targetSession || !targetSession.sock || targetSession.status !== 'CONNECTED') {
                    throw new Error('Session tidak tersedia saat pengiriman berlangsung.');
                }
                await targetSession.sock.sendPresenceUpdate('composing', destination);
                const typingDelay = Math.floor(Math.random() * 1000) + 500;
                await new Promise((resolve) => setTimeout(resolve, typingDelay));
                const result = await sendMessage(targetSession.sock, destination, messagePayload);
                await targetSession.sock.sendPresenceUpdate('paused', destination);
                return result;
            }).catch((error) => ({
                status: 'error',
                message: `Failed to process message for ${to}: ${error.message}`
            }));

            responseSlots.push(sendPromise);
        }

        const resolvedResults = await Promise.all(responseSlots);
        log('Messages sent', sessionId, {
            event: 'messages-sent',
            sessionId,
            count: resolvedResults.length,
            phoneNumbers,
            messages: messageContents
        });
        res.status(200).json(resolvedResults);
    };

    router.post('/messages', handleSendMessage);
    router.post('/', handleSendMessage); // Alias for root URL convenience

    router.delete('/message', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        const { sessionId, messageId, remoteJid } = req.body;

        if (!sessionId || !messageId || !remoteJid) {
            log('API error', 'SYSTEM', { event: 'api-error', error: 'sessionId, messageId, and remoteJid are required.', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'sessionId, messageId, and remoteJid are required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            log('API error', 'SYSTEM', { event: 'api-error', error: `Session ${sessionId} not found or not connected.`, endpoint: req.originalUrl });
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            await session.sock.chatModify({
                clear: { messages: [{ id: messageId, fromMe: true, timestamp: 0 }] }
            }, remoteJid);

            // The above is for clearing. For actual deletion:
            await session.sock.sendMessage(remoteJid, { delete: { remoteJid: remoteJid, fromMe: true, id: messageId } });

            log('Message deleted', messageId, { event: 'message-deleted', messageId, sessionId });
            res.status(200).json({ status: 'success', message: `Attempted to delete message ${messageId}` });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            console.error(`Failed to delete message ${messageId}:`, error);
            res.status(500).json({ status: 'error', message: `Failed to delete message. Reason: ${error.message}` });
        }
    });

    // ==================== ALBUM (Multiple Images) ====================
    router.post('/album', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { to, images, caption } = req.body;

        if (!sessionId || !to || !images || !Array.isArray(images) || images.length < 2) {
            return res.status(400).json({
                status: 'error',
                message: 'sessionId, to, and images array (min 2 images) are required.'
            });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const destination = to.includes('@') ? to : `${formatPhoneNumber(to)}@s.whatsapp.net`;
            const results = [];

            // Send first image with caption
            for (let i = 0; i < images.length; i++) {
                const img = images[i];
                const imageUrl = img.id ? path.join(mediaDir, img.id) : img.link;
                const messagePayload = {
                    image: { url: imageUrl },
                    caption: i === 0 ? (caption || img.caption || '') : (img.caption || '')
                };

                const result = await session.sock.sendMessage(destination, messagePayload);
                results.push({ index: i, messageId: result.key.id, status: 'sent' });

                // Small delay between images for album grouping
                if (i < images.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }

            res.status(200).json({ status: 'success', message: 'Album sent', results });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== GROUP OPERATIONS ====================

    // Create Group
    router.post('/groups', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { name, participants } = req.body;

        if (!sessionId || !name || !participants || !Array.isArray(participants)) {
            return res.status(400).json({
                status: 'error',
                message: 'sessionId, name, and participants array are required.'
            });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const participantJids = participants.map(p =>
                p.includes('@') ? p : `${formatPhoneNumber(p)}@s.whatsapp.net`
            );

            const group = await session.sock.groupCreate(name, participantJids);

            res.status(201).json({
                status: 'success',
                message: 'Group created',
                group: {
                    id: group.id,
                    gid: group.gid,
                    name: name
                }
            });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Get Group Metadata
    router.get('/groups/:groupId', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId;
        const { groupId } = req.params;

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            const metadata = await session.sock.groupMetadata(groupJid);

            res.status(200).json({ status: 'success', group: metadata });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Update Group Subject (Name)
    router.put('/groups/:groupId/subject', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { groupId } = req.params;
        const { subject } = req.body;

        if (!subject) {
            return res.status(400).json({ status: 'error', message: 'subject is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            await session.sock.groupUpdateSubject(groupJid, subject);

            res.status(200).json({ status: 'success', message: 'Group subject updated' });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Update Group Description
    router.put('/groups/:groupId/description', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { groupId } = req.params;
        const { description } = req.body;

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            await session.sock.groupUpdateDescription(groupJid, description || '');

            res.status(200).json({ status: 'success', message: 'Group description updated' });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Update Group Picture
    router.put('/groups/:groupId/picture', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { groupId } = req.params;
        const { image } = req.body; // { id: 'mediaId' } or { link: 'url' }

        if (!image || (!image.id && !image.link)) {
            return res.status(400).json({ status: 'error', message: 'image.id or image.link is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            const imageUrl = image.id ? path.join(mediaDir, image.id) : image.link;

            await session.sock.updateProfilePicture(groupJid, { url: imageUrl });

            res.status(200).json({ status: 'success', message: 'Group picture updated' });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Add Participants to Group
    router.post('/groups/:groupId/participants', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { groupId } = req.params;
        const { participants } = req.body;

        if (!participants || !Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({ status: 'error', message: 'participants array is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            const participantJids = participants.map(p =>
                p.includes('@') ? p : `${formatPhoneNumber(p)}@s.whatsapp.net`
            );

            const result = await session.sock.groupParticipantsUpdate(groupJid, participantJids, 'add');

            res.status(200).json({ status: 'success', message: 'Participants added', result });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Remove Participants from Group
    router.delete('/groups/:groupId/participants', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { groupId } = req.params;
        const { participants } = req.body;

        if (!participants || !Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({ status: 'error', message: 'participants array is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            const participantJids = participants.map(p =>
                p.includes('@') ? p : `${formatPhoneNumber(p)}@s.whatsapp.net`
            );

            const result = await session.sock.groupParticipantsUpdate(groupJid, participantJids, 'remove');

            res.status(200).json({ status: 'success', message: 'Participants removed', result });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Promote Participants to Admin
    router.post('/groups/:groupId/admins', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { groupId } = req.params;
        const { participants } = req.body;

        if (!participants || !Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({ status: 'error', message: 'participants array is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            const participantJids = participants.map(p =>
                p.includes('@') ? p : `${formatPhoneNumber(p)}@s.whatsapp.net`
            );

            const result = await session.sock.groupParticipantsUpdate(groupJid, participantJids, 'promote');

            res.status(200).json({ status: 'success', message: 'Participants promoted to admin', result });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Demote Admins to Participants
    router.delete('/groups/:groupId/admins', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { groupId } = req.params;
        const { participants } = req.body;

        if (!participants || !Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({ status: 'error', message: 'participants array is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            const participantJids = participants.map(p =>
                p.includes('@') ? p : `${formatPhoneNumber(p)}@s.whatsapp.net`
            );

            const result = await session.sock.groupParticipantsUpdate(groupJid, participantJids, 'demote');

            res.status(200).json({ status: 'success', message: 'Admins demoted', result });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Update Group Settings
    router.put('/groups/:groupId/settings', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { groupId } = req.params;
        const { setting, value } = req.body; // setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked'

        if (!setting) {
            return res.status(400).json({
                status: 'error',
                message: 'setting is required. Options: announcement, not_announcement, locked, unlocked'
            });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            await session.sock.groupSettingUpdate(groupJid, setting);

            res.status(200).json({ status: 'success', message: `Group setting updated to ${setting}` });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Leave Group
    router.post('/groups/:groupId/leave', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { groupId } = req.params;

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            await session.sock.groupLeave(groupJid);

            res.status(200).json({ status: 'success', message: 'Left the group' });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Get Group Invite Code
    router.get('/groups/:groupId/invite-code', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId;
        const { groupId } = req.params;

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            const code = await session.sock.groupInviteCode(groupJid);

            res.status(200).json({
                status: 'success',
                inviteCode: code,
                inviteLink: `https://chat.whatsapp.com/${code}`
            });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Revoke Group Invite Code
    router.post('/groups/:groupId/revoke-invite', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { groupId } = req.params;

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            const newCode = await session.sock.groupRevokeInvite(groupJid);

            res.status(200).json({
                status: 'success',
                message: 'Invite code revoked',
                newInviteCode: newCode,
                newInviteLink: `https://chat.whatsapp.com/${newCode}`
            });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Accept Group Invite
    router.post('/groups/accept-invite', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { inviteCode } = req.body;

        if (!inviteCode) {
            return res.status(400).json({ status: 'error', message: 'inviteCode is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            // Extract code if full link was provided
            const code = inviteCode.includes('chat.whatsapp.com/')
                ? inviteCode.split('chat.whatsapp.com/')[1]
                : inviteCode;

            const groupId = await session.sock.groupAcceptInvite(code);

            res.status(200).json({
                status: 'success',
                message: 'Joined group via invite',
                groupId: groupId
            });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== PROFILE OPERATIONS ====================

    // Get Profile Info
    router.get('/profile', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId;
        const { number } = req.query; // Optional: get another user's profile

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            let jid;
            if (number) {
                jid = number.includes('@') ? number : `${formatPhoneNumber(number)}@s.whatsapp.net`;
            } else {
                jid = session.sock.user.id;
            }

            const [status, profilePic] = await Promise.allSettled([
                session.sock.fetchStatus(jid),
                session.sock.profilePictureUrl(jid, 'image')
            ]);

            res.status(200).json({
                status: 'success',
                profile: {
                    jid: jid,
                    name: session.sock.user?.name || null,
                    status: status.status === 'fulfilled' ? status.value?.status : null,
                    setAt: status.status === 'fulfilled' ? status.value?.setAt : null,
                    profilePicture: profilePic.status === 'fulfilled' ? profilePic.value : null
                }
            });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Update Profile Name
    router.put('/profile/name', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ status: 'error', message: 'name is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            await session.sock.updateProfileName(name);
            res.status(200).json({ status: 'success', message: 'Profile name updated' });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Update Profile Status (About)
    router.put('/profile/status', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { status: statusText } = req.body;

        if (statusText === undefined) {
            return res.status(400).json({ status: 'error', message: 'status is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            await session.sock.updateProfileStatus(statusText);
            res.status(200).json({ status: 'success', message: 'Profile status updated' });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Update Profile Picture
    router.put('/profile/picture', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { image } = req.body; // { id: 'mediaId' } or { link: 'url' }

        if (!image || (!image.id && !image.link)) {
            return res.status(400).json({ status: 'error', message: 'image.id or image.link is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const imageUrl = image.id ? path.join(mediaDir, image.id) : image.link;
            await session.sock.updateProfilePicture(session.sock.user.id, { url: imageUrl });
            res.status(200).json({ status: 'success', message: 'Profile picture updated' });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Remove Profile Picture
    router.delete('/profile/picture', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            await session.sock.removeProfilePicture(session.sock.user.id);
            res.status(200).json({ status: 'success', message: 'Profile picture removed' });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== PRESENCE & READ RECEIPTS ====================

    // Update Presence (Online/Offline/Typing)
    router.post('/presence', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { to, presence } = req.body; // presence: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused'

        if (!presence) {
            return res.status(400).json({
                status: 'error',
                message: 'presence is required. Options: available, unavailable, composing, recording, paused'
            });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            if (to) {
                const destination = to.includes('@') ? to : `${formatPhoneNumber(to)}@s.whatsapp.net`;
                await session.sock.sendPresenceUpdate(presence, destination);
            } else {
                await session.sock.sendPresenceUpdate(presence);
            }
            res.status(200).json({ status: 'success', message: `Presence updated to ${presence}` });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Mark Messages as Read
    router.post('/read', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { messages } = req.body; // Array of { remoteJid, id, participant? }

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ status: 'error', message: 'messages array is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const keys = messages.map(m => ({
                remoteJid: m.remoteJid,
                id: m.id,
                participant: m.participant
            }));

            await session.sock.readMessages(keys);
            res.status(200).json({ status: 'success', message: 'Messages marked as read' });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Get Last Seen / Presence
    router.get('/presence/:number', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId;
        const { number } = req.params;

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const jid = number.includes('@') ? number : `${formatPhoneNumber(number)}@s.whatsapp.net`;

            // Subscribe to presence updates
            await session.sock.presenceSubscribe(jid);

            res.status(200).json({
                status: 'success',
                message: 'Subscribed to presence updates. Listen for presence events via webhook.'
            });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== BROADCAST ====================

    // Send Broadcast Message (to multiple contacts)
    router.post('/broadcast', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { recipients, message } = req.body;

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({ status: 'error', message: 'recipients array is required.' });
        }

        if (!message || !message.type) {
            return res.status(400).json({ status: 'error', message: 'message with type is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        const results = [];

        for (const recipient of recipients) {
            try {
                const destination = recipient.includes('@')
                    ? recipient
                    : `${formatPhoneNumber(recipient)}@s.whatsapp.net`;

                // Build message payload based on type
                let messagePayload;
                switch (message.type) {
                    case 'text':
                        messagePayload = { text: message.text };
                        break;
                    case 'image':
                        const imgUrl = message.image.id ? path.join(mediaDir, message.image.id) : message.image.link;
                        messagePayload = { image: { url: imgUrl }, caption: message.image.caption || '' };
                        break;
                    case 'document':
                        const docUrl = message.document.id ? path.join(mediaDir, message.document.id) : message.document.link;
                        messagePayload = { document: { url: docUrl }, fileName: message.document.filename };
                        break;
                    default:
                        messagePayload = { text: message.text || 'Broadcast message' };
                }

                const result = await session.sock.sendMessage(destination, messagePayload);
                results.push({ recipient, status: 'sent', messageId: result.key.id });

                // Add delay between messages to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
            } catch (error) {
                results.push({ recipient, status: 'failed', error: error.message });
            }
        }

        res.status(200).json({
            status: 'success',
            message: `Broadcast sent to ${results.filter(r => r.status === 'sent').length}/${recipients.length} recipients`,
            results
        });
    });

    // ==================== FORWARD MESSAGE ====================

    router.post('/forward', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { to, messageId, fromJid } = req.body;

        if (!to || !messageId || !fromJid) {
            return res.status(400).json({ status: 'error', message: 'to, messageId, and fromJid are required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const destination = to.includes('@') ? to : `${formatPhoneNumber(to)}@s.whatsapp.net`;

            // Forward message
            await session.sock.sendMessage(destination, {
                forward: {
                    key: {
                        remoteJid: fromJid,
                        id: messageId
                    }
                }
            });

            res.status(200).json({ status: 'success', message: 'Message forwarded' });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== STARRED MESSAGES ====================

    router.post('/star', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { messages, star } = req.body; // messages: [{ remoteJid, id }], star: true/false

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ status: 'error', message: 'messages array is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            for (const msg of messages) {
                await session.sock.chatModify({
                    star: {
                        messages: [{ id: msg.id, fromMe: msg.fromMe || false }],
                        star: star !== false
                    }
                }, msg.remoteJid);
            }

            res.status(200).json({ status: 'success', message: `Messages ${star !== false ? 'starred' : 'unstarred'}` });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== CHANNEL MESSAGING ====================

    // Get Newsletters/Channels
    router.get('/channels', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId;

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const newsletters = await session.sock.newsletterMetadata('subscribed');
            res.status(200).json({ status: 'success', channels: newsletters });
        } catch (error) {
            // Channels may not be supported on all accounts
            res.status(200).json({ status: 'success', channels: [], note: 'Channels feature may not be available' });
        }
    });

    // Send Message to Channel
    router.post('/channels/:channelId/messages', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { channelId } = req.params;
        const { type, text, image, video, document } = req.body;

        if (!type) {
            return res.status(400).json({ status: 'error', message: 'type is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const channelJid = channelId.includes('@') ? channelId : `${channelId}@newsletter`;

            let messagePayload;
            switch (type) {
                case 'text':
                    messagePayload = { text: text };
                    break;
                case 'image':
                    const imgUrl = image.id ? path.join(mediaDir, image.id) : image.link;
                    messagePayload = { image: { url: imgUrl }, caption: image.caption || '' };
                    break;
                case 'video':
                    const vidUrl = video.id ? path.join(mediaDir, video.id) : video.link;
                    messagePayload = { video: { url: vidUrl }, caption: video.caption || '' };
                    break;
                case 'document':
                    const docUrl = document.id ? path.join(mediaDir, document.id) : document.link;
                    messagePayload = { document: { url: docUrl }, fileName: document.filename };
                    break;
                default:
                    return res.status(400).json({ status: 'error', message: 'Unsupported message type for channel.' });
            }

            const result = await session.sock.sendMessage(channelJid, messagePayload);
            res.status(200).json({ status: 'success', message: 'Message sent to channel', messageId: result.key.id });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== CHECK NUMBER ON WHATSAPP ====================

    router.post('/check-number', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { numbers } = req.body;

        if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            return res.status(400).json({ status: 'error', message: 'numbers array is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const results = [];

            for (const number of numbers) {
                const jid = number.includes('@') ? number : `${formatPhoneNumber(number)}@s.whatsapp.net`;
                const [result] = await session.sock.onWhatsApp(jid);

                results.push({
                    number: number,
                    exists: result?.exists || false,
                    jid: result?.jid || null
                });
            }

            res.status(200).json({ status: 'success', results });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== GET CONTACTS ====================

    router.get('/contacts', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId;

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            // Get contacts from store if available
            const contacts = session.sock.store?.contacts || {};
            res.status(200).json({ status: 'success', contacts });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== ARCHIVE/UNARCHIVE CHAT ====================

    router.post('/archive', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { chatId, archive } = req.body;

        if (!chatId) {
            return res.status(400).json({ status: 'error', message: 'chatId is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const jid = chatId.includes('@') ? chatId : `${formatPhoneNumber(chatId)}@s.whatsapp.net`;

            await session.sock.chatModify({
                archive: archive !== false
            }, jid);

            res.status(200).json({ status: 'success', message: `Chat ${archive !== false ? 'archived' : 'unarchived'}` });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== MUTE/UNMUTE CHAT ====================

    router.post('/mute', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { chatId, mute, duration } = req.body; // duration in seconds (null = forever)

        if (!chatId) {
            return res.status(400).json({ status: 'error', message: 'chatId is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const jid = chatId.includes('@') ? chatId : `${formatPhoneNumber(chatId)}@s.whatsapp.net`;

            if (mute !== false) {
                const muteExpiration = duration ? Date.now() + (duration * 1000) : null;
                await session.sock.chatModify({
                    mute: muteExpiration
                }, jid);
            } else {
                await session.sock.chatModify({
                    mute: null
                }, jid);
            }

            res.status(200).json({ status: 'success', message: `Chat ${mute !== false ? 'muted' : 'unmuted'}` });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== PIN/UNPIN CHAT ====================

    router.post('/pin', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { chatId, pin } = req.body;

        if (!chatId) {
            return res.status(400).json({ status: 'error', message: 'chatId is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const jid = chatId.includes('@') ? chatId : `${formatPhoneNumber(chatId)}@s.whatsapp.net`;

            await session.sock.chatModify({
                pin: pin !== false
            }, jid);

            res.status(200).json({ status: 'success', message: `Chat ${pin !== false ? 'pinned' : 'unpinned'}` });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== CLEAR CHAT ====================

    router.post('/clear', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { chatId } = req.body;

        if (!chatId) {
            return res.status(400).json({ status: 'error', message: 'chatId is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const jid = chatId.includes('@') ? chatId : `${formatPhoneNumber(chatId)}@s.whatsapp.net`;

            await session.sock.chatModify({
                delete: true,
                lastMessages: [{ key: { remoteJid: jid }, messageTimestamp: 0 }]
            }, jid);

            res.status(200).json({ status: 'success', message: 'Chat cleared' });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== BLOCK/UNBLOCK CONTACT ====================

    router.post('/block', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { number, block } = req.body;

        if (!number) {
            return res.status(400).json({ status: 'error', message: 'number is required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const jid = number.includes('@') ? number : `${formatPhoneNumber(number)}@s.whatsapp.net`;

            if (block !== false) {
                await session.sock.updateBlockStatus(jid, 'block');
            } else {
                await session.sock.updateBlockStatus(jid, 'unblock');
            }

            res.status(200).json({ status: 'success', message: `Contact ${block !== false ? 'blocked' : 'unblocked'}` });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== GET BUSINESS PROFILE ====================

    router.get('/business-profile/:number', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId;
        const { number } = req.params;

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const jid = number.includes('@') ? number : `${formatPhoneNumber(number)}@s.whatsapp.net`;
            const profile = await session.sock.getBusinessProfile(jid);

            res.status(200).json({ status: 'success', profile });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== DOWNLOAD MEDIA FROM MESSAGE ====================

    router.post('/download-media', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { message } = req.body; // The full message object from webhook

        if (!message || !message.message) {
            return res.status(400).json({
                status: 'error',
                message: 'message object with message content is required.'
            });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            // Determine message type
            const messageContent = message.message;
            const contentType = getContentType(messageContent);

            if (!contentType) {
                return res.status(400).json({ status: 'error', message: 'Unable to determine message content type.' });
            }

            // Check if it's a media type
            const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage', 'documentWithCaptionMessage'];
            const actualType = contentType === 'documentWithCaptionMessage'
                ? 'documentMessage'
                : contentType;

            if (!mediaTypes.includes(contentType) && !mediaTypes.includes(actualType)) {
                return res.status(400).json({
                    status: 'error',
                    message: `Message type "${contentType}" is not a downloadable media type.`
                });
            }

            // Download media
            const buffer = await downloadMediaMessage(
                message,
                'buffer',
                {},
                {
                    logger: console,
                    reuploadRequest: session.sock.updateMediaMessage
                }
            );

            // Get media info
            const mediaMessage = messageContent[actualType] || messageContent[contentType];
            const mimetype = mediaMessage?.mimetype || 'application/octet-stream';
            const filename = mediaMessage?.fileName || `media_${Date.now()}`;

            // Option 1: Return as base64
            if (req.body.format === 'base64') {
                return res.status(200).json({
                    status: 'success',
                    mediaType: actualType,
                    mimetype,
                    filename,
                    data: buffer.toString('base64'),
                    size: buffer.length
                });
            }

            // Option 2: Save to server and return URL
            if (req.body.format === 'file' || !req.body.format) {
                const ext = mimetype.split('/')[1] || 'bin';
                const savedFilename = `${randomUUID()}.${ext}`;
                const filePath = path.join(mediaDir, savedFilename);

                fs.writeFileSync(filePath, buffer);

                return res.status(200).json({
                    status: 'success',
                    mediaType: actualType,
                    mimetype,
                    filename,
                    savedAs: savedFilename,
                    url: `/media/${savedFilename}`,
                    size: buffer.length
                });
            }

            // Option 3: Stream directly
            if (req.body.format === 'stream') {
                res.setHeader('Content-Type', mimetype);
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.setHeader('Content-Length', buffer.length);
                return res.send(buffer);
            }

        } catch (error) {
            console.error('Media download error:', error);
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== GET PROFILE PICTURE URL ====================

    router.get('/profile-picture/:jid', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId;
        const { jid } = req.params;
        const { type } = req.query; // 'preview' or 'image' (full)

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const targetJid = jid.includes('@') ? jid : `${formatPhoneNumber(jid)}@s.whatsapp.net`;
            const pictureUrl = await session.sock.profilePictureUrl(targetJid, type || 'image');

            res.status(200).json({
                status: 'success',
                jid: targetJid,
                profilePictureUrl: pictureUrl
            });
        } catch (error) {
            // User may not have profile picture
            res.status(200).json({
                status: 'success',
                jid: jid,
                profilePictureUrl: null,
                note: 'Profile picture not available or privacy settings prevent access'
            });
        }
    });

    // ==================== QUOTED/REPLY MESSAGE ====================

    router.post('/reply', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { to, text, quotedMessageId, quotedMessage } = req.body;

        if (!to || !text || (!quotedMessageId && !quotedMessage)) {
            return res.status(400).json({
                status: 'error',
                message: 'to, text, and quotedMessageId (or quotedMessage) are required.'
            });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const destination = to.includes('@') ? to : `${formatPhoneNumber(to)}@s.whatsapp.net`;

            let messagePayload = { text };

            // If full quoted message object provided
            if (quotedMessage) {
                messagePayload.quoted = quotedMessage;
            } else {
                // Build minimal quoted reference
                messagePayload.quoted = {
                    key: {
                        remoteJid: destination,
                        id: quotedMessageId
                    }
                };
            }

            const result = await session.sock.sendMessage(destination, messagePayload);

            res.status(200).json({
                status: 'success',
                message: 'Reply sent',
                messageId: result.key.id
            });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== SEND MESSAGE WITH MENTION ====================

    router.post('/mention', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { to, text, mentions } = req.body;

        if (!to || !text || !mentions || !Array.isArray(mentions)) {
            return res.status(400).json({
                status: 'error',
                message: 'to, text, and mentions array are required.'
            });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const destination = to.includes('@') ? to : `${to}@g.us`;
            const mentionJids = mentions.map(m =>
                m.includes('@') ? m : `${formatPhoneNumber(m)}@s.whatsapp.net`
            );

            const result = await session.sock.sendMessage(destination, {
                text,
                mentions: mentionJids
            });

            res.status(200).json({
                status: 'success',
                message: 'Message with mentions sent',
                messageId: result.key.id
            });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== SEND LINK WITH PREVIEW ====================

    router.post('/link-preview', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { to, text, title, description, thumbnailUrl } = req.body;

        if (!to || !text) {
            return res.status(400).json({
                status: 'error',
                message: 'to and text are required.'
            });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const destination = to.includes('@') ? to : `${formatPhoneNumber(to)}@s.whatsapp.net`;

            // Extract URL from text
            const urlMatch = text.match(/https?:\/\/[^\s]+/);
            const matchedUrl = urlMatch ? urlMatch[0] : null;

            const messagePayload = {
                text,
                linkPreview: title && matchedUrl ? {
                    title: title,
                    description: description || '',
                    canonicalUrl: matchedUrl,
                    matchedText: matchedUrl,
                    thumbnailUrl: thumbnailUrl
                } : undefined
            };

            const result = await session.sock.sendMessage(destination, messagePayload);

            res.status(200).json({
                status: 'success',
                message: 'Message sent',
                messageId: result.key.id
            });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== GET JOINED GROUPS ====================

    router.get('/groups', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId;

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const groups = await session.sock.groupFetchAllParticipating();
            const groupList = Object.values(groups).map(g => ({
                id: g.id,
                subject: g.subject,
                owner: g.owner,
                creation: g.creation,
                desc: g.desc,
                descId: g.descId,
                restrict: g.restrict,
                announce: g.announce,
                size: g.size,
                participants: g.participants?.length || 0
            }));

            res.status(200).json({
                status: 'success',
                count: groupList.length,
                groups: groupList
            });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ==================== SEARCH MESSAGES (requires store) ====================

    router.post('/search', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { jid, query, limit } = req.body;

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            // Note: Search requires message store to be enabled
            // This is a placeholder - actual implementation depends on store configuration
            res.status(200).json({
                status: 'success',
                note: 'Message search requires store to be enabled. Currently not available.',
                results: []
            });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Make campaign sender available for WebSocket updates
    router.campaignSender = campaignSender;
    
    return router;
}

module.exports = { initializeApi, getWebhookUrl: getWebhookUrl };
