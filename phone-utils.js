/**
 * Utility functions for phone number formatting
 */

/**
 * Format phone number to international format (with 62 prefix for WhatsApp API)
 * Anti-fail: Handles all common Indonesian phone number formats
 * @param {string} phoneNumber - The phone number to format
 * @returns {string} - Formatted phone number with 62 prefix (for WhatsApp API)
 */
function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return '';

    // Convert to string and remove all non-numeric characters (including +, -, spaces, etc)
    let cleaned = phoneNumber.toString().replace(/\D/g, '');

    // Remove any leading zeros
    cleaned = cleaned.replace(/^0+/, '');

    // Handle different starting formats
    if (cleaned.startsWith('62')) {
        // Already in 62 format (from +62 or 62)
        return cleaned;
    } else if (cleaned.startsWith('8')) {
        // Indonesian number without country code (08xxxxxxxxx -> 628xxxxxxxxx)
        return '62' + cleaned;
    } else if (cleaned.length >= 9 && cleaned.length <= 13) {
        // Generic fallback for Indonesian numbers
        // Assume it's missing the country code
        return '62' + cleaned;
    }

    // If none of the above, return as-is (might be international number)
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
 * Anti-fail: More permissive validation for various formats
 * @param {string} phoneNumber - The phone number to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidPhoneNumber(phoneNumber) {
    if (!phoneNumber) return false;

    const formatted = formatPhoneNumber(phoneNumber);

    // Check if it's a valid Indonesian format (628xxxxxxxxx - 9 to 13 digits after 62)
    // OR any international format with country code (at least 10 digits total)
    return /^628\d{8,13}$/.test(formatted) || /^\d{10,15}$/.test(formatted);
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