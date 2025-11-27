/**
 * Utility functions for phone number formatting
 */

/**
 * Format phone number to international format (with 62 prefix for WhatsApp API if Indonesian)
 * @param {string} phoneNumber - The phone number to format
 * @returns {string} - Formatted phone number with country code
 */
function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return phoneNumber;
    
    // Convert to string and remove non-numeric characters
    let cleaned = phoneNumber.toString().replace(/\D/g, '');
    
    // Handle different starting formats for Indonesia (convenience)
    if (cleaned.startsWith('0')) {
        // If starts with 0, replace with 62
        cleaned = '62' + cleaned.substring(1);
    }
    // We removed the aggressive "starts with 8" check to prevent corruption of
    // international numbers (e.g., +81 Japan, +86 China).
    // Users should enter international format or local format with leading 0.
    
    return cleaned;
}

/**
 * Format phone number to include + prefix for display
 * @param {string} phoneNumber - The phone number to format with +
 * @returns {string} - Formatted phone number with + prefix for display
 */
function formatPhoneNumberWithPlus(phoneNumber) {
    const formatted = formatPhoneNumber(phoneNumber);
    if (formatted) {
        return '+' + formatted;
    }
    return formatted;
}

/**
 * Validate phone number format
 * Accepts international numbers (7-15 digits)
 * @param {string} phoneNumber - The phone number to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidPhoneNumber(phoneNumber) {
    if (!phoneNumber) return false;
    
    const formatted = formatPhoneNumber(phoneNumber);
    // Check if it's a valid digit string of reasonable length (ITU E.164 standard is max 15)
    // We allow 7 to 15 digits to cover most countries
    return /^\d{7,15}$/.test(formatted);
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
