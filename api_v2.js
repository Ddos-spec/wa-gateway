const express = require('express');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

// Fungsi ini akan dipanggil dari index.js untuk menginisialisasi API v2
function initializeApiV2(sessions, sessionTokens) {
    const router = express.Router();

    // Handler utama untuk endpoint /send-message
    const sendMessageHandler = async (req, res) => {
        // Menggabungkan parameter dari query (untuk GET) dan body (untuk POST)
        const params = { ...req.query, ...req.body };

        // Mengekstrak parameter yang dibutuhkan
        const { apikey, mtype, receiver, text, url, filename } = params;

        // Validasi parameter wajib
        if (!apikey || !mtype || !receiver) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Parameter wajib tidak lengkap: apikey, mtype, receiver' 
            });
        }

        try {
            // Mencari session yang cocok dengan apikey yang diberikan
            let sessionId = null;
            for (const [sid, token] of sessionTokens.entries()) {
                if (token === apikey) {
                    sessionId = sid;
                    break;
                }
            }

            if (!sessionId) {
                return res.status(403).json({ status: 'error', message: 'API Key tidak valid' });
            }

            const session = sessions.get(sessionId);
            if (!session || !session.sock || session.status !== 'CONNECTED') {
                return res.status(404).json({ 
                    status: 'error', 
                    message: 'Sesi untuk apikey ini tidak ditemukan atau tidak terhubung.' 
                });
            }

            // Menyiapkan JID (nomor tujuan)
            // Jika receiver adalah JID grup (@g.us), gunakan langsung.
            // Jika tidak, format sebagai JID individu.
            const destination = receiver.endsWith('@g.us') 
                ? receiver 
                : jidNormalizedUser(receiver);

            // Membuat payload pesan berdasarkan mtype
            let messagePayload;
            switch (mtype) {
                case 'text':
                    if (!text) throw new Error('Parameter "text" wajib untuk mtype "text".');
                    messagePayload = { text: text };
                    break;
                case 'image':
                    if (!url) throw new Error('Parameter "url" wajib untuk mtype "image".');
                    messagePayload = { image: { url: url }, caption: params.caption || '' };
                    break;
                case 'video':
                    if (!url) throw new Error('Parameter "url" wajib untuk mtype "video".');
                    messagePayload = { video: { url: url }, caption: params.caption || '' };
                    break;
                case 'audio':
                    if (!url) throw new Error('Parameter "url" wajib untuk mtype "audio".');
                    // Baileys expects mimetype for audio
                    messagePayload = { audio: { url: url }, mimetype: 'audio/mp4' }; 
                    break;
                case 'document':
                    if (!url) throw new Error('Parameter "url" wajib untuk mtype "document".');
                    messagePayload = { document: { url: url }, fileName: filename || 'document' };
                    break;
                case 'sticker':
                    if (!url) throw new Error('Parameter "url" wajib untuk mtype "sticker".');
                    messagePayload = { sticker: { url: url } };
                    break;
                default:
                    throw new Error(`Tipe pesan (mtype) tidak didukung: ${mtype}. Tipe yang didukung: text, image, video, audio, document, sticker.`);
            }

            // Mengirim pesan
            const result = await session.sock.sendMessage(destination, messagePayload);

            res.status(200).json({
                status: 'success',
                message: `Pesan terkirim ke ${receiver}`,
                messageId: result.key.id
            });

        } catch (error) {
            console.error(`APIv2 Error: ${error.message}`);
            res.status(500).json({ status: 'error', message: error.message });
        }
    };

    // Menerima metode GET dan POST di endpoint yang sama
    router.all('/send-message', sendMessageHandler);

    return router;
}

module.exports = { initializeApiV2 };
