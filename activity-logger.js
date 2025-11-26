// Activity Logger - Dummy Version (Disabled Feature)
// This file is kept to prevent 'ReferenceError' in other modules that import it.

class ActivityLogger {
    constructor(encryptionKey) {
        // No-op
    }

    async logLogin() { return true; }
    async logUserCreate() { return true; }
    async logUserUpdate() { return true; }
    async logUserDelete() { return true; }
    async logSessionCreate() { return true; }
    async logSessionDelete() { return true; }
    async logMessageSend() { return true; }
    async logCampaignCreate() { return true; }
    async logCampaignStart() { return true; }
    async logCampaignPause() { return true; }
    async logCampaignResume() { return true; }
    async logCampaignComplete() { return true; }
    async logCampaignDelete() { return true; }
    async logCampaignMessage() { return true; }
    async logCampaignRetry() { return true; }

    async getActivities() { return []; }
    async getUserActivities() { return []; }
    async getActivitySummary() { return { total: 0, byType: {} }; }
}

module.exports = ActivityLogger;