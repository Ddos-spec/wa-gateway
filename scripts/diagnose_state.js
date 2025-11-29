const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3000/api/v1';
const AUTH_DIR = path.join(__dirname, '..', 'auth_info_baileys');
const PAIRING_FILE = path.join(__dirname, '..', 'pairing_statuses.json');

async function diagnose() {
    console.log('🔍 STARTING DEEP DIAGNOSIS...\n');

    // 1. Check File System (Auth Folders)
    console.log('📂 CHECKING AUTH FOLDERS:');
    if (fs.existsSync(AUTH_DIR)) {
        const folders = fs.readdirSync(AUTH_DIR);
        console.log(`   Found ${folders.length} folders: ${folders.join(', ')}`);
    } else {
        console.log('   Auth directory not found.');
    }
    console.log('');

    // 2. Check Pairing Status File
    console.log('📄 CHECKING PAIRING STATUS JSON:');
    if (fs.existsSync(PAIRING_FILE)) {
        try {
            const content = fs.readFileSync(PAIRING_FILE, 'utf-8');
            const json = JSON.parse(content);
            console.log('   Content:', JSON.stringify(json, null, 2));
        } catch (e) {
            console.log('   Error reading JSON:', e.message);
        }
    } else {
        console.log('   pairing_statuses.json not found.');
    }
    console.log('');

    // 3. Check API Sessions (Memory State)
    console.log('🧠 CHECKING SERVER MEMORY (VIA API):');
    try {
        const res = await axios.get(`${API_URL}/sessions`);
        const sessions = res.data;
        console.log(`   Server reports ${sessions.length} active sessions:`);
        sessions.forEach(s => {
            console.log(`   - [${s.sessionId}] Status: ${s.status}, HasQR: ${!!s.qr}, Owner: ${s.owner}`);
        });
    } catch (e) {
        console.log('   ❌ Failed to fetch sessions:', e.message);
    }
    console.log('');

    // 4. Check Specific "Conflict" Scenario (Debug Endpoint)
    // We'll check if we can hit the debug endpoint if it exists
    console.log('🕵️ CHECKING DEBUG INFO:');
    try {
        const res = await axios.get(`${API_URL}/debug/sessions`);
        console.log('   Debug Data:', JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.log('   Debug endpoint not available or failed (expected if not authenticated/enabled).');
    }
    
    console.log('\n🏁 DIAGNOSIS COMPLETE.');
}

diagnose();
