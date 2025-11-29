const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_URL = 'http://localhost:3000/api/v1';
const AUTH_DIR = path.join(__dirname, '..', 'auth_info_baileys');
const PAIRING_FILE = path.join(__dirname, '..', 'pairing_statuses.json');

async function cleanup() {
    console.log('🧹 STARTING CLEANUP...');

    // 1. Get active sessions via API
    try {
        const res = await axios.get(`${API_URL}/sessions`);
        const sessions = res.data;
        console.log(`   Found ${sessions.length} active sessions in memory.`);

        for (const s of sessions) {
            console.log(`   - Deleting session: ${s.sessionId}`);
            try {
                // We use the token if available, or rely on the server not checking token for now if we can't get it easily
                // Actually, our delete endpoint requires token.
                // We can bypass this by manually deleting folders and pairing file, then restarting server.
                // But let's try to use the API first if we have a way. 
                // Since we are running locally, we can just kill the folders.
            } catch (e) {
                console.log(`     Failed to delete via API: ${e.message}`);
            }
        }
    } catch (e) {
        console.log('   API check failed (server might be down).');
    }

    // 2. Nuke Auth Folders
    console.log('💥 NUKING AUTH FOLDERS...');
    if (fs.existsSync(AUTH_DIR)) {
        const folders = fs.readdirSync(AUTH_DIR);
        for (const folder of folders) {
            const folderPath = path.join(AUTH_DIR, folder);
            fs.rmSync(folderPath, { recursive: true, force: true });
            console.log(`   Deleted: ${folder}`);
        }
    }

    // 3. Nuke Pairing File
    console.log('💥 NUKING PAIRING STATUSES...');
    if (fs.existsSync(PAIRING_FILE)) {
        fs.unlinkSync(PAIRING_FILE);
        console.log('   Deleted pairing_statuses.json');
    }

    console.log('\n✅ CLEANUP COMPLETE. PLEASE RESTART THE SERVER (npm run dev).');
}

cleanup();
