function copyCurl(id, btn) {
    const el = document.getElementById(id);
    if (!el) {
        console.error(`Element with id "${id}" not found.`);
        return;
    }
    navigator.clipboard.writeText(el.textContent).then(() => {
        if (btn) {
            const original = btn.innerHTML;
            btn.innerHTML = '<i class="bi bi-clipboard-check"></i> Copied';
            btn.classList.add('btn-success');
            btn.classList.remove('btn-outline-secondary');
            setTimeout(() => {
                btn.innerHTML = original;
                btn.classList.remove('btn-success');
                btn.classList.add('btn-outline-secondary');
            }, 1500);
        }
    });
}
