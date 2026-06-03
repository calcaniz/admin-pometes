/* =========================================================
   COMMUNICATIONS.JS — Mensajería masiva a huéspedes
   La Llar de Pometes · Panel de Administración
   ========================================================= */
'use strict';

const CommState = { recipients: [], initialized: false };

function initCommunicationsSection() {
    if (CommState.initialized) return;
    CommState.initialized = true;

    document.getElementById('commFilterForm')?.addEventListener('change', loadRecipients);
    document.getElementById('commSendForm')?.addEventListener('submit', handleSendMessage);
    loadRecipients();
}

async function loadRecipients() {
    const filter = document.getElementById('commFilter')?.value || 'confirmed';
    const days   = document.getElementById('commDays')?.value || 30;
    const list   = document.getElementById('commRecipientsList');
    const count  = document.getElementById('commRecipientsCount');

    if (list) list.innerHTML = '<div style="color:var(--text-light);font-size:13px">Cargando...</div>';

    try {
        const data = await apiFetch(`/communications/recipients?filter=${filter}&days=${days}`);
        CommState.recipients = Array.isArray(data) ? data : [];

        if (count) count.textContent = `${CommState.recipients.length} destinatario${CommState.recipients.length !== 1 ? 's' : ''}`;

        if (!list) return;
        if (CommState.recipients.length === 0) {
            list.innerHTML = '<div style="color:var(--text-light);font-size:13px">Sin destinatarios con el filtro actual.</div>';
            return;
        }
        list.innerHTML = CommState.recipients.slice(0, 10).map(function (r) {
            return `<div style="font-size:13px;padding:4px 0;border-bottom:1px solid var(--border)">
                <strong>${escapeHtml(r.guest_name)}</strong> — ${escapeHtml(r.guest_email)}
                <span style="color:var(--text-light);font-size:11px;margin-left:6px">
                    ${formatDate(r.check_in)} → ${formatDate(r.check_out)}
                </span>
            </div>`;
        }).join('') + (CommState.recipients.length > 10
            ? `<div style="font-size:12px;color:var(--text-light);padding-top:6px">... y ${CommState.recipients.length - 10} más</div>`
            : '');
    } catch (err) {
        if (list) list.innerHTML = '<div style="color:var(--danger);font-size:13px">Error al cargar destinatarios</div>';
    }
}

async function handleSendMessage(e) {
    e.preventDefault();

    const subject = document.getElementById('commSubject').value.trim();
    const message = document.getElementById('commMessage').value.trim();
    const btn     = document.getElementById('commSendBtn');
    const errEl   = document.getElementById('commError');

    if (errEl) errEl.hidden = true;

    if (!subject || !message) {
        if (errEl) { errEl.textContent = 'El asunto y el mensaje son obligatorios.'; errEl.hidden = false; }
        return;
    }
    if (CommState.recipients.length === 0) {
        if (errEl) { errEl.textContent = 'No hay destinatarios seleccionados.'; errEl.hidden = false; }
        return;
    }

    showConfirm({
        icon: '📧',
        title: `Enviar a ${CommState.recipients.length} destinatario${CommState.recipients.length !== 1 ? 's' : ''}`,
        message: `Se enviará el email "${subject}" a ${CommState.recipients.length} huésped${CommState.recipients.length !== 1 ? 'es' : ''}. ¿Confirmas?`,
        acceptText: 'Enviar',
        acceptClass: 'btn-primary',
        onAccept: async function () {
            btn.disabled = true; btn.textContent = 'Enviando...';
            try {
                const ids = CommState.recipients.map(function (r) { return r.id; });
                const result = await apiFetch('/communications/send', {
                    method: 'POST',
                    body: JSON.stringify({ subject, message, booking_ids: ids })
                });
                showToast(`✅ Enviados: ${result.sent}${result.failed ? ` · ❌ Fallidos: ${result.failed}` : ''}`, result.failed ? 'warning' : 'success', 5000);
                e.target.reset();
                if (errEl) errEl.hidden = true;
            } catch (err) {
                if (errEl) { errEl.textContent = 'Error: ' + err.message; errEl.hidden = false; }
            } finally {
                btn.disabled = false; btn.textContent = 'Enviar mensaje';
            }
        }
    });
}
