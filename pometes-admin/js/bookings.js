/* =========================================================
   BOOKINGS.JS — Gestión de reservas: listar, filtrar, paginar,
                 confirmar y cancelar
   La Llar de Pometes · Panel de Administración
   ========================================================= */

'use strict';

// ── Estado local de la sección de reservas ──
const BookingsState = {
    all:         [],
    filtered:    [],
    currentPage: 1,
    perPage:     10,
    filters:     { status: '', source: '', search: '' },
    selected:    new Set(),   // IDs seleccionados para acciones en lote
    initialized: false
};

/**
 * Punto de entrada de la sección de Reservas.
 * Llamado desde dashboard.js al navegar a la sección.
 */
function initBookingsSection() {
    if (!BookingsState.initialized) {
        registerBookingFilters();
        initBulkBar();
        initNewBookingModal();
        BookingsState.initialized = true;
    }

    // Cargar reservas (usa caché si ya están disponibles)
    if (AppState.bookings.length > 0) {
        BookingsState.all = AppState.bookings;
        applyFilters();
    } else {
        loadBookings();
    }
}

/* =========================================================
   CARGA DE RESERVAS
   ========================================================= */

async function loadBookings() {
    setTableLoading(true);
    console.log('[bookings] Llamando a GET /api/bookings...');

    try {
        const data = await BookingsAPI.getAll();
        console.log('[bookings] Respuesta de API:', data);

        const list = Array.isArray(data) ? data : (data.bookings || []);
        console.log('[bookings] Reservas cargadas:', list.length);

        // Sincronizar con el estado global
        AppState.bookings = list;
        BookingsState.all = list;

        updatePendingBadge();
        applyFilters();

    } catch (error) {
        console.error('[bookings] Error al cargar reservas:', error);
        showToast('Error al cargar las reservas: ' + error.message, 'error');
        setTableLoading(false);
    }
}

/* =========================================================
   FILTROS
   ========================================================= */

function registerBookingFilters() {
    // Filtro por estado
    document.getElementById('statusFilter').addEventListener('click', function (e) {
        const tab = e.target.closest('.filter-tab');
        if (!tab) return;

        this.querySelectorAll('.filter-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');

        BookingsState.filters.status = tab.dataset.value;
        BookingsState.currentPage = 1;
        applyFilters();
    });

    // Filtro por origen
    document.getElementById('sourceFilter').addEventListener('click', function (e) {
        const tab = e.target.closest('.filter-tab');
        if (!tab) return;

        this.querySelectorAll('.filter-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');

        BookingsState.filters.source = tab.dataset.value;
        BookingsState.currentPage = 1;
        applyFilters();
    });

    // Buscador (con debounce para no filtrar en cada tecla)
    const searchInput = document.getElementById('searchInput');
    let searchTimer;
    searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
            BookingsState.filters.search = searchInput.value.trim().toLowerCase();
            BookingsState.currentPage = 1;
            applyFilters();
        }, 280);
    });

    // Paginación
    document.getElementById('prevPage').addEventListener('click', function () {
        if (BookingsState.currentPage > 1) {
            BookingsState.currentPage--;
            renderCurrentPage();
            scrollToTableTop();
        }
    });

    document.getElementById('nextPage').addEventListener('click', function () {
        const totalPages = Math.ceil(BookingsState.filtered.length / BookingsState.perPage);
        if (BookingsState.currentPage < totalPages) {
            BookingsState.currentPage++;
            renderCurrentPage();
            scrollToTableTop();
        }
    });
}

/** Aplica los filtros activos y actualiza la vista */
function applyFilters() {
    const { status, source, search } = BookingsState.filters;

    BookingsState.filtered = BookingsState.all.filter(function (b) {
        if (status && b.status !== status) return false;
        if (source && b.source !== source) return false;
        if (search) {
            const name  = (b.guestName  || b.guest_name  || '').toLowerCase();
            const email = (b.guestEmail || b.guest_email || '').toLowerCase();
            if (!name.includes(search) && !email.includes(search)) return false;
        }
        return true;
    });

    // Mostrar contador de resultados
    const total     = BookingsState.filtered.length;
    const totalAll  = BookingsState.all.length;
    const countEl   = document.getElementById('resultsCount');
    if (countEl) {
        if (status || source || search) {
            countEl.textContent = `${total} reserva${total !== 1 ? 's' : ''} encontrada${total !== 1 ? 's' : ''} (de ${totalAll} total${totalAll !== 1 ? 'es' : ''})`;
        } else {
            countEl.textContent = `${totalAll} reserva${totalAll !== 1 ? 's' : ''} en total`;
        }
    }

    renderCurrentPage();
}

/* =========================================================
   RENDERIZADO
   ========================================================= */

function renderCurrentPage() {
    const { filtered, currentPage, perPage } = BookingsState;
    const start   = (currentPage - 1) * perPage;
    const pageData = filtered.slice(start, start + perPage);

    renderTable(pageData, filtered.length === 0);
    renderCards(pageData);
    updatePagination();
    setTableLoading(false);
}

/** Renderiza la tabla desktop */
function renderTable(bookings, isEmpty) {
    const tbody      = document.getElementById('bookingsTableBody');
    const emptyState = document.getElementById('tableEmptyState');

    if (!tbody) return;

    if (isEmpty) {
        tbody.innerHTML = '';
        emptyState.hidden = false;
        return;
    }

    emptyState.hidden = true;

    tbody.innerHTML = bookings.map(function (b) {
        const name    = b.guestName  || b.guest_name  || 'Sin nombre';
        const email   = b.guestEmail || b.guest_email || '';
        const checkIn = b.checkIn    || b.check_in    || '';
        const checkOut= b.checkOut   || b.check_out   || '';
        const nights  = b.nights || calcNights(checkIn, checkOut);
        const price   = formatCurrency(b.totalPrice || b.total_price || 0);
        const checked = BookingsState.selected.has(String(b.id)) ? 'checked' : '';

        const hasNotes   = !!(b.admin_notes || b.adminNotes);
        const hasDeposit = !!(b.deposit_status && b.deposit_status !== 'returned');
        const depositIcon = { pending: '💰⏳', paid: '💰✅', retained: '💰⚠️' }[b.deposit_status] || '';

        return `
            <tr data-id="${b.id}" class="${checked ? 'row-selected' : ''}">
                <td style="width:36px;text-align:center">
                    <input type="checkbox" class="bulk-cb" data-id="${b.id}" ${checked}
                           aria-label="Seleccionar reserva #${b.id}">
                </td>
                <td class="col-id">#${b.id}</td>
                <td class="col-guest">
                    <div class="guest-name">
                        ${escapeHtml(name)}
                        ${hasNotes   ? '<span title="Tiene notas del admin" style="cursor:default">📝</span>' : ''}
                        ${depositIcon ? `<span title="Fianza: ${b.deposit_status}" style="cursor:default;font-size:12px">${depositIcon}</span>` : ''}
                    </div>
                    ${email ? `<div class="guest-email">${escapeHtml(email)}</div>` : ''}
                </td>
                <td class="col-date">${formatDate(checkIn)}</td>
                <td class="col-date">${formatDate(checkOut)}</td>
                <td class="col-nights">${nights}</td>
                <td class="col-price">${price}</td>
                <td>${renderSource(b.source)}</td>
                <td>${renderBadge(b.status)}</td>
                <td>
                    <div class="table-actions">
                        ${renderTableActions(b)}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Checkboxes individuales
    tbody.querySelectorAll('.bulk-cb').forEach(function (cb) {
        cb.addEventListener('change', function () {
            if (this.checked) BookingsState.selected.add(String(this.dataset.id));
            else              BookingsState.selected.delete(String(this.dataset.id));
            this.closest('tr').classList.toggle('row-selected', this.checked);
            updateBulkBar();
        });
    });

    // Checkbox "seleccionar todo"
    const selectAll = document.getElementById('bulkSelectAll');
    if (selectAll) {
        selectAll.checked = false;
        selectAll.addEventListener('change', function () {
            bookings.forEach(function (b) {
                if (selectAll.checked) BookingsState.selected.add(String(b.id));
                else                   BookingsState.selected.delete(String(b.id));
            });
            renderCurrentPage();
            updateBulkBar();
        });
    }

    // Botones de acción por fila
    tbody.querySelectorAll('[data-action]').forEach(function (btn) {
        btn.addEventListener('click', handleTableAction);
    });
}

/** Genera los botones de acción de una fila */
function renderTableActions(booking) {
    let html = `
        <button class="btn-icon" data-action="view" data-id="${booking.id}" title="Ver detalles">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
            </svg>
        </button>
    `;

    if (booking.status === 'confirmed') {
        html += `
            <button class="btn-icon" data-action="receipt" data-id="${booking.id}" title="Generar justificante" style="color:var(--navy)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
            </button>
        `;
    }

    if (booking.status === 'pending') {
        html += `
            <button class="btn-icon" data-action="confirm" data-id="${booking.id}" title="Confirmar reserva" style="color:var(--success)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </button>
        `;
    }

    if (booking.status !== 'cancelled') {
        html += `
            <button class="btn-icon" data-action="cancel" data-id="${booking.id}" title="Cancelar reserva" style="color:var(--danger)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;
    }

    return html;
}

/** Manejador de clicks en los botones de la tabla */
function handleTableAction(e) {
    const btn    = e.currentTarget;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;

    switch (action) {
        case 'view':    goToBookingDetail(id);                        break;
        case 'confirm': confirmBooking(id);                           break;
        case 'cancel':  cancelBooking(id);                            break;
        case 'receipt': openReceiptModal(findBooking(id) || { id }); break;
    }
}

/** Renderiza las cards para móvil */
function renderCards(bookings) {
    const container = document.getElementById('bookingsCards');
    if (!container) return;

    if (bookings.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No hay reservas que coincidan con los filtros</p></div>';
        return;
    }

    container.innerHTML = bookings.map(function (b) {
        const name    = b.guestName  || b.guest_name  || 'Sin nombre';
        const email   = b.guestEmail || b.guest_email || '';
        const checkIn = b.checkIn    || b.check_in    || '';
        const checkOut= b.checkOut   || b.check_out   || '';
        const nights  = b.nights || calcNights(checkIn, checkOut);
        const price   = formatCurrency(b.totalPrice || b.total_price || 0);

        return `
            <div class="booking-card">
                <div class="booking-card-header">
                    <div>
                        <div class="booking-card-id">#${b.id}</div>
                        <div class="booking-card-name">
                            ${escapeHtml(name)}
                            ${!!(b.admin_notes||b.adminNotes) ? '<span title="Notas del admin">📝</span>' : ''}
                        </div>
                        ${email ? `<div class="booking-card-email">${escapeHtml(email)}</div>` : ''}
                    </div>
                    ${renderBadge(b.status)}
                </div>
                <div class="booking-card-body">
                    <div class="booking-card-field">
                        <label>Check-in</label>
                        <span>${formatDate(checkIn)}</span>
                    </div>
                    <div class="booking-card-field">
                        <label>Check-out</label>
                        <span>${formatDate(checkOut)}</span>
                    </div>
                    <div class="booking-card-field">
                        <label>Noches</label>
                        <span>${nights}</span>
                    </div>
                    <div class="booking-card-field">
                        <label>Precio</label>
                        <span>${price}</span>
                    </div>
                    <div class="booking-card-field">
                        <label>Origen</label>
                        <span>${renderSource(b.source)}</span>
                    </div>
                </div>
                <div class="booking-card-footer">
                    <div class="booking-card-actions">
                        <a class="btn btn-ghost btn-sm" href="booking-detail.html?id=${b.id}">👁️ Ver</a>
                        ${b.status === 'confirmed' ? `<button class="btn btn-ghost btn-sm" data-action="receipt" data-id="${b.id}">🖨️ Justificante</button>` : ''}
                        ${b.status === 'pending' ? `<button class="btn btn-success btn-sm" data-action="confirm" data-id="${b.id}">✅ Confirmar</button>` : ''}
                        ${b.status !== 'cancelled' ? `<button class="btn btn-danger btn-sm" data-action="cancel" data-id="${b.id}">❌ Cancelar</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Registrar eventos en las cards
    container.querySelectorAll('[data-action]').forEach(function (btn) {
        btn.addEventListener('click', handleTableAction);
    });
}

/* =========================================================
   PAGINACIÓN
   ========================================================= */

function updatePagination() {
    const total      = BookingsState.filtered.length;
    const totalPages = Math.ceil(total / BookingsState.perPage) || 1;
    const current    = BookingsState.currentPage;
    const start      = (current - 1) * BookingsState.perPage + 1;
    const end        = Math.min(current * BookingsState.perPage, total);

    const infoEl   = document.getElementById('paginationInfo');
    const prevBtn  = document.getElementById('prevPage');
    const nextBtn  = document.getElementById('nextPage');

    infoEl.textContent   = total > 0 ? `${start}–${end} de ${total}` : '0 resultados';
    prevBtn.disabled     = current <= 1;
    nextBtn.disabled     = current >= totalPages;
}

function scrollToTableTop() {
    const card = document.querySelector('[data-section="bookings"] .table-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* =========================================================
   ACCIONES: CONFIRMAR Y CANCELAR
   ========================================================= */

/* =========================================================
   BARRA DE ACCIONES EN LOTE
   ========================================================= */

function updateBulkBar() {
    const bar      = document.getElementById('bulkBar');
    const countEl  = document.getElementById('bulkCount');
    const n        = BookingsState.selected.size;
    if (!bar) return;
    bar.hidden = n === 0;
    if (countEl) countEl.textContent = `${n} reserva${n !== 1 ? 's' : ''} seleccionada${n !== 1 ? 's' : ''}`;
}

function initBulkBar() {
    const bar = document.getElementById('bulkBar');
    if (!bar || bar.dataset.initialized) return;
    bar.dataset.initialized = 'true';

    document.getElementById('bulkConfirmBtn')?.addEventListener('click', function () {
        const ids = [...BookingsState.selected].filter(function (id) {
            const b = findBooking(id);
            return b && b.status === 'pending';
        });
        if (ids.length === 0) { showToast('No hay reservas pendientes seleccionadas', 'warning'); return; }
        showConfirm({
            icon: '✅', title: `Confirmar ${ids.length} reserva${ids.length !== 1 ? 's' : ''}`,
            message: `Se confirmarán ${ids.length} reserva${ids.length !== 1 ? 's' : ''} y se notificará a los huéspedes.`,
            acceptText: 'Confirmar todas', acceptClass: 'btn-success',
            onAccept: function () { executeBulkAction(ids, 'confirmed'); }
        });
    });

    document.getElementById('bulkCancelBtn')?.addEventListener('click', function () {
        const ids = [...BookingsState.selected].filter(function (id) {
            const b = findBooking(id);
            return b && b.status !== 'cancelled';
        });
        if (ids.length === 0) { showToast('No hay reservas cancelables seleccionadas', 'warning'); return; }
        showConfirm({
            icon: '⚠️', title: `Cancelar ${ids.length} reserva${ids.length !== 1 ? 's' : ''}`,
            message: `Se cancelarán ${ids.length} reserva${ids.length !== 1 ? 's' : ''}. Esta acción no es fácilmente reversible.`,
            acceptText: 'Cancelar todas', acceptClass: 'btn-danger',
            onAccept: function () { executeBulkAction(ids, 'cancelled'); }
        });
    });

    document.getElementById('bulkClearBtn')?.addEventListener('click', function () {
        BookingsState.selected.clear();
        renderCurrentPage();
        updateBulkBar();
    });
}

async function executeBulkAction(ids, status) {
    let ok = 0, fail = 0;
    for (const id of ids) {
        try {
            await BookingsAPI.updateStatus(id, status);
            updateBookingInState(id, { status });
            ok++;
        } catch { fail++; }
    }
    BookingsState.selected.clear();
    applyFilters();
    updateBulkBar();
    const msg = `${ok} reserva${ok !== 1 ? 's' : ''} ${status === 'confirmed' ? 'confirmada' : 'cancelada'}${ok !== 1 ? 's' : ''}`;
    showToast(fail > 0 ? `${msg} · ${fail} con error` : msg, fail > 0 ? 'warning' : 'success');
}

/**
 * Confirma una reserva con diálogo de confirmación previo.
 * Aplica cambio optimista en la UI antes de la respuesta de la API.
 */
function confirmBooking(id) {
    const booking = findBooking(id);
    const name    = booking ? (booking.guestName || booking.guest_name || `#${id}`) : `#${id}`;

    showConfirm({
        icon:        '✅',
        title:       'Confirmar reserva',
        message:     `¿Confirmar la reserva de ${name}? El huésped recibirá la confirmación.`,
        acceptText:  'Sí, confirmar',
        acceptClass: 'btn-success',
        onAccept:    function () { executeStatusChange(id, 'confirmed'); }
    });
}

/**
 * Cancela una reserva pidiendo motivo al admin.
 */
function cancelBooking(id) {
    const booking = findBooking(id);
    const name    = booking ? (booking.guestName || booking.guest_name || `#${id}`) : `#${id}`;

    showConfirm({
        icon:        '⚠️',
        title:       'Cancelar reserva',
        message:     `¿Cancelar la reserva de ${name}?`,
        extra:       `<div style="margin-top:12px">
                        <label style="font-size:13px;font-weight:600;color:var(--text-mid);display:block;margin-bottom:6px">
                          Motivo de cancelación
                        </label>
                        <select id="cancelReasonSelect" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);
                                border-radius:6px;font-size:13px;background:var(--white)">
                          <option value="">Sin especificar</option>
                          <option value="Solicitud del huésped">Solicitud del huésped</option>
                          <option value="Fechas no disponibles">Fechas no disponibles</option>
                          <option value="Problemas en la propiedad">Problemas en la propiedad</option>
                          <option value="Reserva duplicada">Reserva duplicada</option>
                          <option value="Otro motivo">Otro motivo</option>
                        </select>
                      </div>`,
        acceptText:  'Sí, cancelar',
        acceptClass: 'btn-danger',
        onAccept:    function () {
            const reason = document.getElementById('cancelReasonSelect')?.value || undefined;
            executeStatusChange(id, 'cancelled', reason);
        }
    });
}

/** Ejecuta el cambio de estado: actualiza UI optimistamente y luego llama a la API */
async function executeStatusChange(id, newStatus, cancellationReason) {
    // Guardar el estado previo ANTES del cambio optimista para poder revertirlo si falla
    const booking    = findBooking(id);
    const prevStatus = booking ? booking.status : null;

    console.log(`[bookings] executeStatusChange id=${id} ${prevStatus} → ${newStatus}`);

    // Actualización optimista: cambiar el estado en memoria antes de esperar la API
    updateBookingInState(id, { status: newStatus });
    applyFilters();

    const messages = {
        confirmed: { ok: '✅ Reserva confirmada correctamente.',  err: 'No se pudo confirmar la reserva.' },
        cancelled: { ok: '❌ Reserva cancelada correctamente.',   err: 'No se pudo cancelar la reserva.'  }
    };

    try {
        // Verificar que el token existe antes de enviar
        const token = getToken();
        console.log(`[bookings] Token presente: ${!!token}`);
        console.log(`[bookings] PUT /api/bookings/${id}/status  body:`, { status: newStatus });

        await BookingsAPI.updateStatus(id, newStatus, cancellationReason);

        console.log(`[bookings] PUT /api/bookings/${id}/status → OK`);
        showToast(messages[newStatus].ok, 'success');

    } catch (error) {
        console.error(`[bookings] PUT /api/bookings/${id}/status → ERROR`, error);

        // Revertir al estado anterior real (no asumir cuál era)
        if (prevStatus) {
            updateBookingInState(id, { status: prevStatus });
            applyFilters();
        }

        showToast(`${messages[newStatus].err} ${error.message}`, 'error');
    }
}

/* =========================================================
   UTILIDADES DE RESERVAS
   ========================================================= */

/** Navega a la página de detalle de la reserva */
function goToBookingDetail(id) {
    window.location.href = `booking-detail.html?id=${id}`;
}

/** Busca una reserva por ID en el estado global */
function findBooking(id) {
    return AppState.bookings.find(function (b) { return String(b.id) === String(id); });
}

/** Actualiza los campos de una reserva en el estado global */
function updateBookingInState(id, updates) {
    AppState.bookings = AppState.bookings.map(function (b) {
        return String(b.id) === String(id) ? Object.assign({}, b, updates) : b;
    });
    BookingsState.all = AppState.bookings;
    updatePendingBadge();
}

/* =========================================================
   MODAL: NUEVA RESERVA (ADMIN)
   ========================================================= */

function initNewBookingModal() {
    var btn = document.getElementById('newBookingBtn');
    if (!btn || btn.dataset.initialized) return;
    btn.dataset.initialized = 'true';

    btn.addEventListener('click', openNewBookingModal);
    document.getElementById('newBookingModalClose')?.addEventListener('click', closeNewBookingModal);
    document.getElementById('newBookingModalCancelBtn')?.addEventListener('click', closeNewBookingModal);
    document.getElementById('newBookingModalOverlay')?.addEventListener('click', function (e) {
        if (e.target === this) closeNewBookingModal();
    });
    document.getElementById('nb_calc_price_btn')?.addEventListener('click', calculatePriceForNewBooking);
    document.getElementById('newBookingModalSubmitBtn')?.addEventListener('click', submitNewBooking);

    // Limpiar precio calculado si cambian las fechas
    ['nb_check_in', 'nb_check_out'].forEach(function (id) {
        document.getElementById(id)?.addEventListener('change', function () {
            document.getElementById('nb_total_price').value = '';
            document.getElementById('nb_price_hint').style.display = 'none';
        });
    });
}

function openNewBookingModal() {
    var overlay = document.getElementById('newBookingModalOverlay');
    if (!overlay) return;

    document.getElementById('newBookingForm').reset();
    document.getElementById('nb_send_emails').checked = true;
    var radioConfirmed = document.querySelector('input[name="nb_status"][value="confirmed"]');
    if (radioConfirmed) radioConfirmed.checked = true;
    document.getElementById('nb_form_error').hidden = true;
    document.getElementById('nb_price_hint').style.display = 'none';

    var today = new Date().toISOString().slice(0, 10);
    document.getElementById('nb_check_in').min  = today;
    document.getElementById('nb_check_out').min = today;

    overlay.hidden = false;
    setTimeout(function () { document.getElementById('nb_guest_name').focus(); }, 50);
}

function closeNewBookingModal() {
    var overlay = document.getElementById('newBookingModalOverlay');
    if (overlay) overlay.hidden = true;
}

async function calculatePriceForNewBooking() {
    var checkIn  = document.getElementById('nb_check_in').value;
    var checkOut = document.getElementById('nb_check_out').value;

    if (!checkIn || !checkOut) {
        showToast('Selecciona las fechas antes de calcular el precio', 'warning');
        return;
    }

    var btn = document.getElementById('nb_calc_price_btn');
    btn.disabled    = true;
    btn.textContent = '...';

    try {
        var result = await PricingAPI.getQuote(checkIn, checkOut);
        document.getElementById('nb_total_price').value = result.totalPrice;
        var hint = document.getElementById('nb_price_hint');
        hint.textContent    = result.nights + ' noche' + (result.nights !== 1 ? 's' : '') + ' × ' + result.pricePerNight + ' €/noche';
        hint.style.display  = 'block';
    } catch (err) {
        showToast('No se pudo calcular el precio: ' + err.message, 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Calcular';
    }
}

async function submitNewBooking() {
    var submitBtn = document.getElementById('newBookingModalSubmitBtn');
    var errorDiv  = document.getElementById('nb_form_error');
    var errorMsg  = document.getElementById('nb_form_error_msg');

    function showFormError(msg) {
        errorMsg.textContent = msg;
        errorDiv.hidden      = false;
        submitBtn.disabled   = false;
        submitBtn.textContent = 'Crear reserva';
    }

    errorDiv.hidden = true;

    var guest_name   = document.getElementById('nb_guest_name').value.trim();
    var guest_email  = document.getElementById('nb_guest_email').value.trim();
    var guest_phone  = document.getElementById('nb_guest_phone').value.trim();
    var check_in     = document.getElementById('nb_check_in').value;
    var check_out    = document.getElementById('nb_check_out').value;
    var guests       = parseInt(document.getElementById('nb_guests').value) || 1;
    var source       = document.getElementById('nb_source').value;
    var priceVal     = document.getElementById('nb_total_price').value;
    var arrival_time = document.getElementById('nb_arrival_time').value;
    var notes        = document.getElementById('nb_notes').value.trim();
    var send_emails  = document.getElementById('nb_send_emails').checked;
    var statusRadio  = document.querySelector('input[name="nb_status"]:checked');
    var status       = statusRadio ? statusRadio.value : 'confirmed';

    if (!guest_name)  return showFormError('El nombre del huésped es obligatorio');
    if (!check_in)    return showFormError('La fecha de check-in es obligatoria');
    if (!check_out)   return showFormError('La fecha de check-out es obligatoria');
    if (check_in >= check_out) return showFormError('El check-out debe ser posterior al check-in');

    if (send_emails && !guest_email) {
        if (!confirm('No hay email del huésped — no se podrá enviar el email de confirmación. ¿Continuar igualmente?')) return;
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Creando...';

    try {
        var data = await BookingsAPI.createAdmin({
            guest_name,
            guest_email:  guest_email  || null,
            guest_phone:  guest_phone  || null,
            check_in,
            check_out,
            guests,
            source,
            total_price:  priceVal !== '' ? parseFloat(priceVal) : null,
            arrival_time: arrival_time || null,
            notes:        notes        || null,
            send_emails,
            status,
        });

        closeNewBookingModal();
        showToast('Reserva #' + data.id + ' creada correctamente', 'success');

        // Recargar lista de reservas
        AppState.bookings  = [];
        BookingsState.all  = [];
        await loadBookings();

    } catch (err) {
        showFormError(err.message || 'Error al crear la reserva');
    }
}

/** Muestra/oculta el estado de carga en la tabla */
function setTableLoading(loading) {
    const tbody = document.getElementById('bookingsTableBody');
    if (!tbody) return;

    if (loading) {
        tbody.innerHTML = Array(5).fill(0).map(function () {
            return `<tr>${Array(9).fill('<td><div class="skeleton" style="height:14px;border-radius:4px"></div></td>').join('')}</tr>`;
        }).join('');
        document.getElementById('tableEmptyState').hidden = true;
    }
}
