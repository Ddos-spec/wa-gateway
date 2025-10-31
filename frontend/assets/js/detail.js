async function fetchProfileInfo() {
    try {
        const response = await fetch(`${config.backendApiUrl}/api/profile/${sessionId}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        const data = await response.json();

        if (response.ok) {
            document.getElementById('profileName').textContent = data.name || 'Nama tidak tersedia';
            document.getElementById('waNumber').textContent = data.number || '-';
        } else {
            console.error('Failed to fetch profile info:', data.message || 'Unknown error');
            showToast('error', data.message || 'Gagal memuat informasi profil');
        }
    } catch (error) {
        console.error('Fetch profile info error:', error);
        showToast('error', 'Terjadi kesalahan saat memuat informasi profil.');
    }
}

async function loadQrCode() {
    const qrContainer = document.getElementById('qrCodeContainer');
    qrContainer.innerHTML = `
        <div class="text-center">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Memuat QR Code...</p>
        </div>
    `;

    try {
        const response = await fetch(`${config.backendApiUrl}${config.endpoints.sessions}/${sessionId}/qr`, {
            method: 'POST', // Use POST to trigger session start
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();

        if (response.ok && data.qr) {
            qrContainer.innerHTML = `
                <img src="${data.qr}" alt="QR Code" class="img-fluid" style="max-width: 300px;">
                <p class="mt-2 text-muted">Pindai QR code dengan WhatsApp</p>
            `;
        } else if (response.ok && !data.qr) {
            qrContainer.innerHTML = `<p class="text-success">Sudah terhubung. Status akan segera update.</p>`;
            fetchProfileInfo(); // Fetch profile info upon successful connection
        } else {
            throw new Error(data.error || 'Gagal memuat QR Code');
        }
    } catch (error) {
        console.error('Load QR code error:', error);
        qrContainer.innerHTML = `
            <p class="text-danger">Gagal memuat QR Code.</p>
            <button class="btn btn-primary btn-sm" onclick="loadQrCode()">
                <i class="bi bi-arrow-repeat"></i> Coba Lagi
            </button>
        `;
    }
}
