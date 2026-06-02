/* =========================================================
   BLOCKED-DATES.JS — Gestión de fechas bloqueadas
   Casa Rural Pometes · Panel de Administración
   ========================================================= */

'use strict';

// Estado local de la sección
const BlockedDatesState = {
    items: [],
    initialized: false
};

function initBlockedDatesSection() {
    if (BlockedDatesState.initialized) {
        renderBlockedDatesList();
        return;
    }
    BlockedDatesState.initialized = true;

    const form = document.getElementById('blockDateForm');
    if (form) {
        form.addEventListener('submit', handleBlockDateSubmit);
    }

    loadBlockedDates();
}

async function loadBlockedDates() {
    const list = document.getElementById('blockedDatesList');
    if (list) list.innerHTML = '<div class="bd-loading">Cargando bloqueos...</div>';

    try {
        const data = await BlockedDatesAPI.getAll();
        BlockedDatesState.items = Array.isArray(data) ? data : [];
        renderBlockedDatesList();
    } catch (err) {
        console.error('[blocked-dates] Error al cargar:', err);
        showToast('No se pudieron cargar los bloqueos: ' + err.message, 'error');
        if (list) list.innerHTML = '<div class="bd-empty">Error al cargar bloqueos</div>';
    }
}

function renderBlockedDatesList() {
    const list = document.getElementById('blockedDatesList');
    if (!list) return;

    const items = BlockedDatesState.items;

    if (items.length === 0) {
        list.innerHTML = `
            <div class="bd-empty">
                <div style="font-size:32px;margin-bottom:8px">✅</div>
                <p>No hay fechas bloqueadas</p>
            </div>`;
        return;
    }

    const today = new Date().toISOString().slice(0, 10);

    list.innerHTML = items.map(function (item) {
        const isPast    = item.date_to < today;
        const isActive  = item.date_from <= today && item.date_to >= today;
        const nights    = calcNights(item.date_from, item.date_to) + 1;
        const nightsLabel = nights === 1 ? '1 día' : `${nights} días`;

        let statusClass = 'bd-status-upcoming';
        let statusLabel = 'Próximo';
        if (isPast)   { statusClass = 'bd-status-past';   statusLabel = 'Pasado'; }
        if (isActive) { statusClass = 'bd-status-active'; statusLabel = 'Activo'; }

        return `
            <div class="bd-item ${isPast ? 'bd-item--past' : ''}">
                <div class="bd-item-icon">🚫</div>
                <div class="bd-item-info">
                    <div class="bd-item-dates">
                        ${formatDate(item.date_from)} → ${formatDate(item.date_to)}
                        <span class="bd-nights">${nightsLabel}</span>
                    </div>
                    <div class="bd-item-reason">${escapeHtml(item.reason || 'Sin motivo especificado')}</div>
                </div>
                <div class="bd-item-right">
                    <span class="bd-status ${statusClass}">${statusLabel}</span>
                    <button class="btn btn-ghost btn-sm bd-delete-btn"
                            data-id="${item.id}" title="Eliminar bloqueo">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/>
                        </svg>
                    </button>
                </div>
            </div>`;
    }).join('');

    // Eventos de borrado
    list.querySelectorAll('.bd-delete-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const id = this.dataset.id;
            const item = BlockedDatesState.items.find(function (i) { return String(i.id) === String(id); });
            showConfirm({
                icon:    '🚫',
                title:   '¿Eliminar bloqueo?',
                message: item
                    ? `Se desbloqueará el período ${formatDate(item.date_from)} → ${formatDate(item.date_to)}.`
                    : 'Esta acción no se puede deshacer.',
                acceptText:  'Eliminar',
                acceptClass: 'btn-danger',
                onAccept: function () { deleteBlock(id); }
            });
        });
    });
}

async function handleBlockDateSubmit(e) {
    e.preventDefault();

    const dateFrom  = document.getElementById('bdDateFrom').value;
    const dateTo    = document.getElementById('bdDateTo').value;
    const reason    = document.getElementById('bdReason').value.trim();
    const submitBtn = document.getElementById('bdSubmitBtn');
    const errorEl   = document.getElementById('bdFormError');

    // Ocultar error previo
    if (errorEl) errorEl.hidden = true;

    if (!dateFrom || !dateTo) {
        showBdError('Las fechas de inicio y fin son obligatorias.');
        return;
    }
    if (dateFrom > dateTo) {
        showBdError('La fecha de inicio debe ser anterior o igual a la fecha de fin.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    try {
        const newBlock = await BlockedDatesAPI.create({
            date_from: dateFrom,
            date_to:   dateTo,
            reason:    reason || undefined
        });

        BlockedDatesState.items.push(newBlock);
        BlockedDatesState.items.sort(function (a, b) {
            return a.date_from.localeCompare(b.date_from);
        });

        renderBlockedDatesList();
        e.target.reset();
        showToast('Fechas bloqueadas correctamente', 'success');

        // Refrescar el calendario si está visible
        if (typeof loadCalendar === 'function') loadCalendar();

    } catch (err) {
        showBdError(err.message || 'No se pudo crear el bloqueo.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Bloquear fechas';
    }
}

async function deleteBlock(id) {
    try {
        await BlockedDatesAPI.remove(id);
        BlockedDatesState.items = BlockedDatesState.items.filter(function (i) {
            return String(i.id) !== String(id);
        });
        renderBlockedDatesList();
        showToast('Bloqueo eliminado', 'success');

        if (typeof loadCalendar === 'function') loadCalendar();
    } catch (err) {
        showToast('Error al eliminar el bloqueo: ' + err.message, 'error');
    }
}

function showBdError(msg) {
    const el = document.getElementById('bdFormError');
    const msgEl = document.getElementById('bdFormErrorMsg');
    if (el && msgEl) {
        msgEl.textContent = msg;
        el.hidden = false;
    }
}
