/* =========================================================
   BOOKING-DETAIL.JS — Página completa de detalle de reserva
   La Llar de Pometes · Panel de Administración
   ========================================================= */
'use strict';

// ── Utilidades ────────────────────────────────────────────────────────────────

function formatDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
}

function formatDateLong(iso) {
    if (!iso) return '—';
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount || 0);
}

function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function calcNights(ci, co) {
    if (!ci || !co) return '—';
    return Math.round((new Date(co) - new Date(ci)) / 86400000);
}

function badge(status) {
    const map = { pending:'badge-pending', confirmed:'badge-confirmed', cancelled:'badge-cancelled' };
    const lbl = { pending:'Pendiente', confirmed:'Confirmada', cancelled:'Cancelada' };
    return `<span class="badge ${map[status]||'badge-pending'}">${lbl[status]||status}</span>`;
}

function depositPill(status) {
    const map = {
        pending:  ['status-pill-pending',  '⏳ Pendiente de cobro'],
        paid:     ['status-pill-paid',     '✅ Cobrada'],
        returned: ['status-pill-returned', '↩️ Devuelta'],
        retained: ['status-pill-retained', '⚠️ Retenida'],
    };
    const [cls, label] = map[status] || ['status-pill-pending', '—'];
    return `<span class="status-pill ${cls}">${label}</span>`;
}

function paymentPill(status) {
    return status === 'paid'
        ? '<span class="status-pill status-pill-paid">✅ Pagado</span>'
        : '<span class="status-pill status-pill-pending">⏳ Pendiente</span>';
}

function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(function () {
        toast.classList.add('exiting');
        toast.addEventListener('animationend', function () { toast.remove(); }, { once: true });
    }, duration);
}

// ── Diálogo de confirmación ────────────────────────────────────────────────────

let _confirmCb = null;

function showConfirm(opts) {
    document.getElementById('confirmIcon').textContent    = opts.icon    || '❓';
    document.getElementById('confirmTitle').textContent   = opts.title   || '¿Estás seguro?';
    document.getElementById('confirmMessage').textContent = opts.message || '';
    const extraEl = document.getElementById('confirmExtra');
    if (extraEl) extraEl.innerHTML = opts.extra || '';
    const acceptBtn = document.getElementById('confirmAccept');
    acceptBtn.textContent = opts.acceptText  || 'Aceptar';
    acceptBtn.className   = `btn ${opts.acceptClass || 'btn-danger'}`;
    _confirmCb = opts.onAccept || null;
    document.getElementById('confirmOverlay').hidden = false;
}

document.getElementById('confirmCancel').addEventListener('click', function () {
    document.getElementById('confirmOverlay').hidden = true;
    _confirmCb = null;
});
document.getElementById('confirmAccept').addEventListener('click', function () {
    const cb = _confirmCb;
    document.getElementById('confirmOverlay').hidden = true;
    _confirmCb = null;
    if (typeof cb === 'function') cb();
});
document.getElementById('confirmOverlay').addEventListener('click', function (e) {
    if (e.target === this) { this.hidden = true; _confirmCb = null; }
});
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.getElementById('confirmOverlay').hidden = true;
});

// ── Inicialización ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    requireAuth();

    const params = new URLSearchParams(window.location.search);
    const id     = params.get('id');

    if (!id) {
        showError('No se especificó ninguna reserva.');
        return;
    }

    loadBooking(id);
});

async function loadBooking(id) {
    try {
        const data    = await BookingsAPI.getById(id);
        const booking = data.booking || data;
        renderPage(booking);
    } catch (err) {
        showError('No se pudo cargar la reserva: ' + err.message);
    }
}

function showError(msg) {
    document.getElementById('pageTitle').textContent = 'Error';
    document.getElementById('detailContent').innerHTML = `
        <div class="detail-loading">
            <div style="font-size:40px">❌</div>
            <p>${escapeHtml(msg)}</p>
            <a href="dashboard.html" class="btn btn-ghost">Volver al panel</a>
        </div>`;
}

// ── Renderizado principal ──────────────────────────────────────────────────────

function renderPage(booking) {
    const name    = booking.guest_name  || '—';
    const checkIn = booking.check_in    || booking.checkIn;
    const checkOut= booking.check_out   || booking.checkOut;
    const nights  = calcNights(checkIn, checkOut);

    // Título en la topbar
    document.title = `Reserva #${booking.id} · ${name} — La llar de pometes`;
    document.getElementById('pageTitle').innerHTML =
        `<span style="color:var(--text-light);font-weight:500">Reserva</span>
         <span style="color:var(--text-light)">#${booking.id}</span>
         <span>·</span>
         <span>${escapeHtml(name)}</span>
         ${badge(booking.status)}`;

    renderTopbarActions(booking);
    renderContent(booking, nights, checkIn, checkOut);
}

function renderTopbarActions(booking) {
    const el = document.getElementById('pageActions');
    let html = '';

    if (booking.status === 'pending') {
        html += `<button class="btn btn-success btn-sm" onclick="doConfirm(${booking.id})">✅ Confirmar</button>`;
    }
    if (booking.status !== 'cancelled') {
        html += `<button class="btn btn-danger btn-sm" onclick="doCancel(${booking.id})">❌ Cancelar</button>`;
    }

    el.innerHTML = html;
}

function renderContent(booking, nights, checkIn, checkOut) {
    const email   = booking.guest_email || '—';
    const phone   = booking.guest_phone || '—';
    const guests  = booking.guests || '—';
    const price   = formatCurrency(booking.total_price || booking.totalPrice);
    const arrival = booking.arrival_time || '—';
    const source  = { direct:'🌐 Web directa', airbnb:'🏠 Airbnb', booking:'📱 Booking' }[booking.source] || booking.source || '—';
    const created = booking.created_at
        ? new Date(booking.created_at).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
        : '—';

    const services  = booking.services || [];
    const hasDeposit = !!booking.deposit_amount;

    document.getElementById('detailContent').innerHTML = `

        <!-- Fila 1: Huésped · Estancia · Precio -->
        <div class="detail-grid">

            <!-- Huésped -->
            <div class="detail-section-card">
                <div class="detail-section-title">👤 Huésped</div>
                <div class="detail-section-body">
                    <div class="detail-field"><label>Nombre</label><span>${escapeHtml(name)}</span></div>
                    <div class="detail-field"><label>Email</label>
                        <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></div>
                    <div class="detail-field"><label>Teléfono</label>
                        <a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></div>
                    <div class="detail-field"><label>Personas</label><span>${guests}</span></div>
                    <div class="detail-field"><label>Canal</label><span>${source}</span></div>
                    <div class="detail-field"><label>Solicitud</label><span>${created}</span></div>
                </div>
            </div>

            <!-- Estancia -->
            <div class="detail-section-card">
                <div class="detail-section-title">🗓️ Estancia</div>
                <div class="detail-section-body">
                    <div class="detail-field"><label>Check-in</label>
                        <span>${formatDateLong(checkIn)}</span></div>
                    <div class="detail-field"><label>Check-out</label>
                        <span>${formatDateLong(checkOut)}</span></div>
                    <div class="detail-field"><label>Noches</label>
                        <span class="detail-value-large">${nights}</span></div>
                    <div class="detail-field"><label>Hora llegada</label><span>${arrival}</span></div>
                    ${booking.cancellation_reason ? `
                    <div class="detail-field" style="padding-top:8px;border-top:1px solid var(--border)">
                        <label>Motivo cancelación</label>
                        <span style="color:var(--danger)">${escapeHtml(booking.cancellation_reason)}</span>
                    </div>` : ''}
                </div>
            </div>

            <!-- Precio & Estado -->
            <div class="detail-section-card">
                <div class="detail-section-title">💰 Precio y estado</div>
                <div class="detail-section-body">
                    <div class="detail-field"><label>Total</label>
                        <span class="detail-value-large">${price}</span></div>
                    <div class="detail-field"><label>Estado reserva</label>
                        <span>${badge(booking.status)}</span></div>
                    <div class="detail-field"><label>Estado pago</label>
                        <span id="paymentStatus">${paymentPill(booking.payment_status)}</span></div>
                    ${booking.payment_status !== 'paid' ? `
                    <button class="btn btn-success btn-sm" onclick="doMarkPaid(${booking.id})" style="margin-top:4px">
                        ✅ Marcar como pagado
                    </button>` : ''}
                    ${booking.gdpr_consent_at ? `
                    <div class="detail-field" style="margin-top:4px">
                        <label>Consentimiento RGPD</label>
                        <span style="font-size:12px;color:var(--text-light)">✅ ${new Date(booking.gdpr_consent_at).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})}</span>
                    </div>` : ''}
                </div>
            </div>

        </div>

        <!-- Fila 2: Servicios · Fianza -->
        <div class="detail-grid-wide">

            <!-- Servicios -->
            <div class="detail-section-card">
                <div class="detail-section-title">🛎️ Servicios contratados</div>
                <div class="detail-section-body">
                    ${services.length === 0
                        ? '<p style="color:var(--text-light);font-size:13px;margin:0">Sin servicios adicionales</p>'
                        : `<table class="services-detail-table">
                            <thead>
                                <tr><th>Servicio</th><th>Tipo</th><th style="text-align:right">Precio</th></tr>
                            </thead>
                            <tbody>
                                ${services.map(function (s) {
                                    return `<tr>
                                        <td>${escapeHtml(s.name)}</td>
                                        <td style="color:var(--text-light);font-size:12px">${s.mandatory ? 'Obligatorio' : 'Opcional'}</td>
                                        <td style="text-align:right;font-weight:600">${parseFloat(s.price) > 0 ? formatCurrency(s.price) : 'Incluido'}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                        <div class="services-total">
                            <span>Total servicios</span>
                            <span>${formatCurrency(services.reduce(function(sum,s){return sum+parseFloat(s.price||0);},0))}</span>
                        </div>`
                    }
                </div>
            </div>

            <!-- Fianza -->
            <div class="detail-section-card">
                <div class="detail-section-title">🔐 Fianza</div>
                <div class="detail-section-body" id="depositSection">
                    ${hasDeposit ? renderDepositSection(booking) : '<p style="color:var(--text-light);font-size:13px;margin:0">No se requiere fianza para esta reserva</p>'}
                </div>
            </div>

        </div>

        <!-- Fila 3: Notas de huésped · Notas admin -->
        <div class="detail-grid-wide">

            <!-- Notas huésped -->
            <div class="detail-section-card">
                <div class="detail-section-title">💬 Notas del huésped</div>
                <div class="detail-section-body">
                    <p style="font-size:14px;color:${booking.notes ? 'var(--text)' : 'var(--text-light)'};
                               white-space:pre-wrap;margin:0;line-height:1.6">
                        ${booking.notes ? escapeHtml(booking.notes) : 'Sin notas adicionales'}
                    </p>
                </div>
            </div>

            <!-- Notas admin -->
            <div class="detail-section-card">
                <div class="detail-section-title">🗒️ Notas del administrador <span style="font-weight:400;text-transform:none;letter-spacing:0">(solo visibles aquí)</span></div>
                <div class="detail-section-body">
                    <textarea class="notes-textarea" id="adminNotesInput" rows="5"
                              placeholder="Añade notas internas sobre esta reserva…">${escapeHtml(booking.admin_notes || '')}</textarea>
                    <button class="btn btn-ghost btn-sm" onclick="doSaveNotes(${booking.id})" style="align-self:flex-start">
                        💾 Guardar notas
                    </button>
                </div>
            </div>

        </div>

        <!-- Historial de emails -->
        <div class="detail-full detail-section-card">
            <div class="detail-section-title">📧 Emails enviados</div>
            <div class="detail-section-body" id="emailHistorySection">
                <div style="color:var(--text-light);font-size:13px">Cargando historial…</div>
            </div>
        </div>
    `;

    // Cargar historial de emails
    loadEmailHistory(booking.id);
}

function renderDepositSection(booking) {
    const amount = booking.deposit_amount;
    const status = booking.deposit_status || 'pending';
    const notes  = booking.deposit_notes;

    let actions = '';
    if (status === 'pending') {
        actions = `<button class="btn btn-success btn-sm" onclick="doDeposit(${booking.id},'paid')">✅ Marcar cobrada</button>`;
    } else if (status === 'paid') {
        actions = `
            <button class="btn btn-ghost btn-sm" onclick="doDeposit(${booking.id},'returned')">↩️ Devolver</button>
            <button class="btn btn-danger btn-sm" onclick="doRetainDeposit(${booking.id})">⚠️ Retener</button>`;
    }

    return `
        <div class="detail-field">
            <label>Importe</label>
            <span class="detail-value-large">${formatCurrency(amount)}</span>
        </div>
        <div class="detail-field">
            <label>Estado</label>
            <span id="depositStatusEl">${depositPill(status)}</span>
        </div>
        ${notes ? `<div class="detail-field"><label>Notas</label><span>${escapeHtml(notes)}</span></div>` : ''}
        ${actions ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px" id="depositActions">${actions}</div>` : ''}
    `;
}

// ── Historial de emails ───────────────────────────────────────────────────────

const TYPE_LABELS = {
    request_guest:   'Solicitud → Huésped',
    request_admin:   'Solicitud → Admin',
    confirmed_guest: 'Confirmación → Huésped',
    confirmed_admin: 'Confirmación → Admin',
    cancelled_guest: 'Cancelación → Huésped',
    reminder_admin:  'Recordatorio → Admin',
    review_request:  'Solicitud valoración',
    bulk_message:    'Comunicación masiva',
};

async function loadEmailHistory(bookingId) {
    const section = document.getElementById('emailHistorySection');
    if (!section) return;

    try {
        const logs = await BookingsAPI.getEmailLogs(bookingId);
        if (!logs || logs.length === 0) {
            section.innerHTML = '<p style="color:var(--text-light);font-size:13px;margin:0">No hay emails registrados.</p>';
            return;
        }

        section.innerHTML = logs.map(function (l) {
            const label = TYPE_LABELS[l.type] || l.type;
            const date  = new Date(l.sent_at).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
            const icon  = l.success ? '✅' : '❌';
            return `
                <div class="email-row">
                    <div class="email-row-left">
                        <span>${icon}</span>
                        <span style="font-weight:500">${label}</span>
                        ${!l.success && l.error_msg ? `<span style="font-size:12px;color:var(--danger)">${escapeHtml(l.error_msg)}</span>` : ''}
                    </div>
                    <div class="email-row-right">
                        <span class="email-date">${date}</span>
                        <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 8px"
                                onclick="doResendEmail(${bookingId},'${l.type}',this)">
                            🔄 Reenviar
                        </button>
                    </div>
                </div>`;
        }).join('');
    } catch {
        section.innerHTML = '<p style="color:var(--text-light);font-size:13px;margin:0">Error al cargar el historial.</p>';
    }
}

// ── Acciones ──────────────────────────────────────────────────────────────────

function doConfirm(id) {
    showConfirm({
        icon: '✅', title: 'Confirmar reserva',
        message: '¿Confirmar la reserva? El huésped recibirá el email de confirmación.',
        acceptText: 'Sí, confirmar', acceptClass: 'btn-success',
        onAccept: async function () {
            try {
                await BookingsAPI.updateStatus(id, 'confirmed');
                showToast('Reserva confirmada ✅', 'success');
                setTimeout(function () { loadBooking(id); }, 800);
            } catch (err) { showToast('Error: ' + err.message, 'error'); }
        }
    });
}

function doCancel(id) {
    showConfirm({
        icon: '⚠️', title: 'Cancelar reserva',
        message: '¿Cancelar la reserva? El huésped recibirá el email de cancelación.',
        extra: `<div style="margin-top:12px">
                    <label style="font-size:13px;font-weight:600;color:var(--text-mid);display:block;margin-bottom:6px">Motivo</label>
                    <select id="cancelReasonSelect" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:13px">
                        <option value="">Sin especificar</option>
                        <option value="Solicitud del huésped">Solicitud del huésped</option>
                        <option value="Fechas no disponibles">Fechas no disponibles</option>
                        <option value="Problemas en la propiedad">Problemas en la propiedad</option>
                        <option value="Reserva duplicada">Reserva duplicada</option>
                        <option value="Otro motivo">Otro motivo</option>
                    </select>
                </div>`,
        acceptText: 'Sí, cancelar', acceptClass: 'btn-danger',
        onAccept: async function () {
            const reason = document.getElementById('cancelReasonSelect')?.value || undefined;
            try {
                await BookingsAPI.updateStatus(id, 'cancelled', reason);
                showToast('Reserva cancelada', 'success');
                setTimeout(function () { loadBooking(id); }, 800);
            } catch (err) { showToast('Error: ' + err.message, 'error'); }
        }
    });
}

async function doMarkPaid(id) {
    try {
        await BookingsAPI.updatePayment(id, 'paid');
        showToast('Pago registrado ✅', 'success');
        setTimeout(function () { loadBooking(id); }, 600);
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function doDeposit(id, status) {
    try {
        await apiFetch(`/bookings/${id}/deposit`, { method:'PUT', body: JSON.stringify({ status }) });
        showToast(`Fianza → ${status}`, 'success');
        setTimeout(function () { loadBooking(id); }, 600);
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

function doRetainDeposit(id) {
    showConfirm({
        icon: '⚠️', title: 'Retener fianza',
        message: '¿Deseas retener la fianza? Indica el motivo:',
        extra: `<textarea id="retainReason" rows="2" placeholder="Motivo…"
                    style="width:100%;margin-top:10px;padding:8px;border:1.5px solid var(--border);
                           border-radius:6px;font-size:13px;resize:none;font-family:inherit"></textarea>`,
        acceptText: 'Retener', acceptClass: 'btn-danger',
        onAccept: async function () {
            const notes = document.getElementById('retainReason')?.value || '';
            try {
                await apiFetch(`/bookings/${id}/deposit`, { method:'PUT', body: JSON.stringify({ status:'retained', notes }) });
                showToast('Fianza retenida', 'success');
                setTimeout(function () { loadBooking(id); }, 600);
            } catch (err) { showToast('Error: ' + err.message, 'error'); }
        }
    });
}

async function doSaveNotes(id) {
    const notes = document.getElementById('adminNotesInput')?.value || '';
    try {
        await apiFetch(`/bookings/${id}/notes`, { method:'PUT', body: JSON.stringify({ admin_notes: notes }) });
        showToast('Notas guardadas 💾', 'success');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function doResendEmail(bookingId, type, btn) {
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳';
    try {
        await apiFetch(`/bookings/${bookingId}/resend-email`, { method:'POST', body: JSON.stringify({ type }) });
        btn.textContent = '✅';
        showToast('Email reenviado', 'success');
    } catch (err) {
        btn.textContent = '❌';
        showToast('Error: ' + err.message, 'error');
    }
    setTimeout(function () { btn.textContent = orig; btn.disabled = false; }, 2500);
}
