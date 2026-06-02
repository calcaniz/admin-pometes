/* =========================================================
   BOOKINGS.JS — Gestión de reservas: listar, filtrar, paginar,
                 confirmar y cancelar
   Casa Rural Pometes · Panel de Administración
   ========================================================= */

'use strict';

// ── Estado local de la sección de reservas ──
const BookingsState = {
    all:         [],    // todas las reservas cargadas
    filtered:    [],    // resultado de aplicar filtros
    currentPage: 1,
    perPage:     10,
    filters: {
        status: '',
        source: '',
        search: ''
    },
    initialized: false  // evitar registrar listeners múltiples veces
};

/**
 * Punto de entrada de la sección de Reservas.
 * Llamado desde dashboard.js al navegar a la sección.
 */
function initBookingsSection() {
    if (!BookingsState.initialized) {
        registerBookingFilters();
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

    try {
        const data = await BookingsAPI.getAll();
        const list = Array.isArray(data) ? data : (data.bookings || []);

        // Sincronizar con el estado global
        AppState.bookings = list;
        BookingsState.all = list;

        updatePendingBadge();
        applyFilters();

    } catch (error) {
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

        return `
            <tr data-id="${b.id}">
                <td class="col-id">#${b.id}</td>
                <td class="col-guest">
                    <div class="guest-name">${escapeHtml(name)}</div>
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

    // Registrar eventos de las acciones
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
        case 'view':    openBookingModal(id);  break;
        case 'confirm': confirmBooking(id);    break;
        case 'cancel':  cancelBooking(id);     break;
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
                        <div class="booking-card-name">${escapeHtml(name)}</div>
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
                        <button class="btn btn-ghost btn-sm" data-action="view" data-id="${b.id}">👁️ Ver</button>
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
 * Cancela una reserva con diálogo de confirmación previo.
 */
function cancelBooking(id) {
    const booking = findBooking(id);
    const name    = booking ? (booking.guestName || booking.guest_name || `#${id}`) : `#${id}`;

    showConfirm({
        icon:        '⚠️',
        title:       'Cancelar reserva',
        message:     `¿Cancelar la reserva de ${name}? Esta acción no se puede deshacer fácilmente.`,
        acceptText:  'Sí, cancelar',
        acceptClass: 'btn-danger',
        onAccept:    function () { executeStatusChange(id, 'cancelled'); }
    });
}

/** Ejecuta el cambio de estado: actualiza UI optimistamente y luego llama a la API */
async function executeStatusChange(id, newStatus) {
    // Actualización optimista: cambiar el estado en memoria antes de esperar la API
    updateBookingInState(id, { status: newStatus });
    applyFilters(); // re-renderizar con el nuevo estado

    const messages = {
        confirmed: { ok: '✅ Reserva confirmada correctamente.',  err: 'No se pudo confirmar la reserva.' },
        cancelled: { ok: '❌ Reserva cancelada correctamente.',   err: 'No se pudo cancelar la reserva.'  }
    };

    try {
        await BookingsAPI.updateStatus(id, newStatus);
        showToast(messages[newStatus].ok, 'success');

    } catch (error) {
        // Revertir el cambio optimista si la API falla
        const prevStatus = newStatus === 'confirmed' ? 'pending' : 'confirmed';
        updateBookingInState(id, { status: prevStatus });
        applyFilters();

        showToast(`${messages[newStatus].err} ${error.message}`, 'error');
    }
}

/* =========================================================
   UTILIDADES DE RESERVAS
   ========================================================= */

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
