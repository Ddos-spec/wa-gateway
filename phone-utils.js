/**
 * Utility functions for phone number formatting
 */

/**
 * Format phone number to international format (with 62 prefix for WhatsApp API)
 * @param {string} phoneNumber - The phone number to format
 * @returns {string} - Formatted phone number with 62 prefix (for WhatsApp API)
 */
function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return phoneNumber;
    
    // Convert to string and remove non-numeric characters
    let cleaned = phoneNumber.toString().replace(/\D/g, '');
    
    // Handle different starting formats
    if (cleaned.startsWith('0')) {
        // If starts with 0, replace with 62
        cleaned = '62' + cleaned.substring(1);
    } else if (cleaned.startsWith('62')) {
        // If already starts with 62, keep as is
        cleaned = cleaned;
    } else if (cleaned.startsWith('62')) {
        // This is a duplicate condition, keeping original logic
        cleaned = cleaned;
    } else if (cleaned.length === 10 || cleaned.length === 11 || cleaned.length === 12) {
        // If it looks like an Indonesian number without country code, prepend 62
        // Indonesian numbers typically start with 8 when without country code
        if (cleaned.startsWith('8')) {
            cleaned = '62' + cleaned;
        }
    }
    
    return cleaned;
}

/**
 * Format phone number to include + prefix for display
 * @param {string} phoneNumber - The phone number to format with +
 * @returns {string} - Formatted phone number with +62 prefix for display
 */
function formatPhoneNumberWithPlus(phoneNumber) {
    const formatted = formatPhoneNumber(phoneNumber);
    if (formatted && formatted.startsWith('62')) {
        return '+' + formatted;
    }
    return formatted;
}

/**
 * Validate phone number format
 * @param {string} phoneNumber - The phone number to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidPhoneNumber(phoneNumber) {
    if (!phoneNumber) return false;
    
    const formatted = formatPhoneNumber(phoneNumber);
    // Check if it matches the Indonesian format (628xxxxxxxxx)
    return /^628\d{8,11}$/.test(formatted);
}

/**
 * Convert phone number to WhatsApp format (with @s.whatsapp.net suffix)
 * @param {string} phoneNumber - The phone number to convert
 * @returns {string} - WhatsApp formatted number
 */
function toWhatsAppFormat(phoneNumber) {
    if (!phoneNumber) return phoneNumber;
    
    const formatted = formatPhoneNumber(phoneNumber);
    return `${formatted}@s.whatsapp.net`;
}

module.exports = {
    formatPhoneNumber,
    formatPhoneNumberWithPlus,
    isValidPhoneNumber,
    toWhatsAppFormat
};