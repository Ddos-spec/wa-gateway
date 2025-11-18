/**
 * Authentication Service - Admin Only Mode
 *
 * Simplified authentication for admin-only access (no database)
 */

const { getLogger } = require('../utils/logger');

const logger = getLogger();

class AuthService {
    constructor() {
        // Singleton for admin-only mode
    }

    /**
     * Authenticate admin (password-only, no database)
     * @param {string} password - Admin password
     * @returns {Promise<Object>} Authentication result
     */
    async authenticateAdmin(password) {
        try {
            const adminPassword = process.env.ADMIN_DASHBOARD_PASSWORD;

            if (password === adminPassword) {
                logger.info('Admin authenticated successfully', 'AUTH');
                return {
                    success: true,
                    userType: 'admin',
                    user: {
                        id: 0,
                        email: 'admin',
                        role: 'admin'
                    }
                };
            }

            logger.warn('Authentication failed', 'AUTH');
            return { success: false, error: 'Invalid password' };

        } catch (error) {
            logger.error('Authentication error', 'AUTH', { error: error.message });
            throw error;
        }
    }

    // Legacy method for compatibility - redirects to authenticateAdmin
    async authenticate(email, password) {
        return this.authenticateAdmin(password);
    }
}

// Create singleton instance
const authService = new AuthService();

module.exports = authService;
