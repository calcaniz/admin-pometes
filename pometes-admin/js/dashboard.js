/* =========================================================
   DASHBOARD.JS — Lógica principal del panel
   Casa Rural Pometes · Panel de Administración
   ========================================================= */

'use strict';

// ── Estado global compartido ──
const AppState = {
    bookings: [],          // todas las reservas cargadas en memoria
    currentSection: null   // null para que navigateTo('home') no se bloquee por el guard
};

// ── Inicialización cuando el DOM está listo ──
// Un único listener centraliza todos los bindings de eventos del dashboard
document.addEventListener('DOMContentLoaded', function () {
    console.log('[dashboard] DOMContentLoaded — iniciando panel');

    // Verificar sesión: redirige a login si no hay token
    requireAuth();
    console.log('[auth] Token presente:', !!getToken());

    initSidebar();
    initNavigation();
    initHeader();
    initLogout();
    initModalBindings();
    initConfirmBindings();

    // Cargar la sección inicial (Inicio)
    console.log('[dashboard] Navegando a sección inicial: home');
    navigateTo('home');
});

/* =========================================================
   SIDEBAR Y NAVEGACIÓN MÓVIL
   ========================================================= */

function initSidebar() {
    const sidebar        = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const hamburger      = document.getElementById('hamburger');

    // Abrir sidebar en móvil
    hamburger.addEventListener('click', function () {
        const isOpen = sidebar.classList.contains('open');
        setSidebarOpen(!isOpen);
    });

    // Cerrar al tocar el overlay
    sidebarOverlay.addEventListener('click', function () {
        setSidebarOpen(false);
    });

    // Cerrar con Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            setSidebarOpen(false);
        }
    });
}

function setSidebarOpen(open) {
    const sidebar        = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const hamburger      = document.getElementById('hamburger');

    sidebar.classList.toggle('open', open);
    sidebarOverlay.classList.toggle('active', open);
    hamburger.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
}

/* =========================================================
   NAVEGACIÓN ENTRE SECCIONES
   ========================================================= */

function initNavigation() {
    // Links del menú lateral
    document.querySelectorAll('.nav-item[data-section]').forEach(function (link) {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            navigateTo(this.dataset.section);
            setSidebarOpen(false); // cerrar sidebar en móvil al navegar
        });
    });

    // Links "Ver todas →" de la sección de inicio
    document.querySelectorAll('.card-action[data-section]').forEach(function (link) {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            navigateTo(this.dataset.section);
        });
    });
}

/** Navega a la sección indicada y carga sus datos */
function navigateTo(sectionName) {
    // Guard: evitar recargar la sección que ya está activa (solo si ya se inicializó)
    if (AppState.currentSection !== null && AppState.currentSection === sectionName) return;

    console.log('[nav] Navegando de', AppState.currentSection, '→', sectionName);

    AppState.currentSection = sectionName;

    // Actualizar clases activas en el menú
    document.querySelectorAll('.nav-item[data-section]').forEach(function (item) {
        item.classList.toggle('active', item.dataset.section === sectionName);
    });

    // Mostrar la sección correspondiente
    document.querySelectorAll('.section[data-section]').forEach(function (section) {
        section.classList.toggle('active', section.dataset.section === sectionName);
    });

    // Actualizar título del header
    const titles = {
        home:           'Inicio',
        bookings:       'Reservas',
        calendar:       'Calendario',
        'blocked-dates':'Bloqueos de fechas',
        'pricing-rules':'Precios por temporada',
        services:       'Servicios extra',
        analytics:      'Analíticas',
        channels:       'Canales externos',
        settings:       'Configuración'
    };
    document.getElementById('headerTitle').textContent = titles[sectionName] || sectionName;

    // Cargar datos de la sección
    switch (sectionName) {
        case 'home':           loadHomeSection();           break;
        case 'bookings':       initBookingsSection();       break;
        case 'calendar':       initCalendarSection();       break;
        case 'blocked-dates':  initBlockedDatesSection();   break;
        case 'pricing-rules':  initPricingRulesSection();   break;
        case 'services':       initServicesSection();        break;
        case 'analytics':      initAnalyticsSection();      break;
        case 'channels':       initChannelsSection();       break;
        case 'settings':       initSettingsSection();       break;
    }
}

/* =========================================================
   HEADER
   ========================================================= */

function initHeader() {
    // Mostrar fecha actual
    const dateEl = document.getElementById('headerDate');
    if (dateEl) {
        const now = new Date();
        dateEl.textContent = now.toLocaleDateString('es-ES', {
            weekday: 'long',
            day:     'numeric',
            month:   'long',
            year:    'numeric'
        });
    }
}

/* =========================================================
   LOGOUT
   ========================================================= */

function initLogout() {
    const btn = document.getElementById('logoutBtn');
    if (!btn) return;

    btn.addEventListener('click', function () {
        showConfirm({
            icon:    '👋',
            title:   '¿Cerrar sesión?',
            message: 'Se cerrará tu sesión y volverás a la pantalla de acceso.',
            acceptText:  'Cerrar sesión',
            acceptClass: 'btn-danger',
            onAccept: function () { logout(); }
        });
    });
}

/* =========================================================
   SECCIÓN: INICIO
   ========================================================= */

async function loadHomeSection() {
    // Si ya tenemos reservas en memoria, recalcular métricas sin llamar a la API
    if (AppState.bookings.length > 0) {
        console.log('[home] Usando caché local:', AppState.bookings.length, 'reservas');
        renderMetrics(AppState.bookings);
        renderRecentBookings(AppState.bookings);
        return;
    }

    console.log('[home] Llamando a GET /api/bookings...');
    try {
        const data = await BookingsAPI.getAll();
        console.log('[home] Respuesta de API /bookings:', data);

        // La API puede devolver { bookings: [] } o directamente []
        AppState.bookings = Array.isArray(data) ? data : (data.bookings || []);
        console.log('[home] Reservas cargadas:', AppState.bookings.length);

        renderMetrics(AppState.bookings);
        renderRecentBookings(AppState.bookings);
        updatePendingBadge();

    } catch (error) {
        console.error('[home] Error al cargar reservas:', error);
        showToast('No se pudieron cargar las reservas: ' + error.message, 'error');
        renderMetrics([]);
        renderRecentBookings([]);
    }
}

/** Renderiza las 4 tarjetas de métricas */
function renderMetrics(bookings) {
    const now        = new Date();
    const thisYear   = now.getFullYear();
    const thisMonth  = now.getMonth(); // 0-based

    // Filtrar reservas del mes actual
    const ofThisMonth = bookings.filter(function (b) {
        const date = new Date(b.checkIn || b.check_in || b.createdAt || b.created_at || '');
        return date.getFullYear() === thisYear && date.getMonth() === thisMonth;
    });

    const pending   = bookings.filter(function (b) { return b.status === 'pending'; }).length;
    const confirmed = ofThisMonth.filter(function (b) { return b.status === 'confirmed'; }).length;
    const cancelled = ofThisMonth.filter(function (b) { return b.status === 'cancelled'; }).length;
    const income    = ofThisMonth
        .filter(function (b) { return b.status === 'confirmed'; })
        .reduce(function (sum, b) { return sum + Number(b.totalPrice || b.total_price || 0); }, 0);

    document.getElementById('metricPending').textContent   = pending;
    document.getElementById('metricConfirmed').textContent = confirmed;
    document.getElementById('metricCancelled').textContent = cancelled;
    document.getElementById('metricIncome').textContent    = formatCurrency(income);
}

/** Renderiza la lista de las últimas 5 reservas */
function renderRecentBookings(bookings) {
    const container = document.getElementById('recentBookingsList');
    if (!container) return;

    // Ordenar por fecha de creación (más reciente primero)
    const sorted = [...bookings].sort(function (a, b) {
        return new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0);
    });

    const recent = sorted.slice(0, 5);

    if (recent.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No hay reservas todavía</p></div>';
        return;
    }

    container.innerHTML = recent.map(function (booking) {
        const name     = booking.guestName  || booking.guest_name  || 'Sin nombre';
        const initials = getInitials(name);
        const checkIn  = formatDate(booking.checkIn  || booking.check_in);
        const checkOut = formatDate(booking.checkOut || booking.check_out);
        const price    = formatCurrency(booking.totalPrice || booking.total_price || 0);
        const badgeHtml = renderBadge(booking.status);

        return `
            <div class="recent-booking-item" data-id="${booking.id}" title="Ver detalles">
                <div class="recent-guest-avatar">${initials}</div>
                <div class="recent-booking-info">
                    <div class="recent-booking-name">${escapeHtml(name)}</div>
                    <div class="recent-booking-dates">${checkIn} → ${checkOut}</div>
                </div>
                <div class="recent-booking-right">
                    <span class="recent-booking-price">${price}</span>
                    ${badgeHtml}
                </div>
            </div>
        `;
    }).join('');

    // Click para abrir modal de detalle
    container.querySelectorAll('.recent-booking-item').forEach(function (item) {
        item.addEventListener('click', function () {
            openBookingModal(this.dataset.id);
        });
    });
}

/** Actualiza el badge de pendientes en el menú lateral */
function updatePendingBadge() {
    const badge   = document.getElementById('pendingBadge');
    const pending = AppState.bookings.filter(function (b) { return b.status === 'pending'; }).length;

    if (pending > 0) {
        badge.textContent = pending > 99 ? '99+' : pending;
        badge.hidden = false;
    } else {
        badge.hidden = true;
    }
}

/* =========================================================
   SECCIÓN: CALENDARIO
   ========================================================= */

// Estado del calendario
const CalState = {
    year:          new Date().getFullYear(),
    month:         new Date().getMonth() + 1, // 1-based
    bookedDates:   [],   // fechas ocupadas (reservas + bloqueos combinados)
    blockedRanges: [],   // bloqueos manuales { date_from, date_to }
    selectedDay:   null
};

function initCalendarSection() {
    const prevBtn = document.getElementById('calPrevMonth');
    const nextBtn = document.getElementById('calNextMonth');

    // Evitar registrar múltiples listeners
    if (prevBtn.dataset.initialized) return;
    prevBtn.dataset.initialized = nextBtn.dataset.initialized = 'true';

    prevBtn.addEventListener('click', function () {
        if (CalState.month === 1) {
            CalState.month = 12;
            CalState.year--;
        } else {
            CalState.month--;
        }
        CalState.selectedDay = null;
        document.getElementById('calendarDayInfo').hidden = true;
        loadCalendar();
    });

    nextBtn.addEventListener('click', function () {
        if (CalState.month === 12) {
            CalState.month = 1;
            CalState.year++;
        } else {
            CalState.month++;
        }
        CalState.selectedDay = null;
        document.getElementById('calendarDayInfo').hidden = true;
        loadCalendar();
    });

    loadCalendar();
}

async function loadCalendar() {
    updateCalendarTitle();
    renderCalendarSkeleton();

    try {
        const [availData, blocksData] = await Promise.all([
            CalendarAPI.getAvailability(CalState.year, CalState.month),
            BlockedDatesAPI.getAll().catch(() => [])
        ]);
        CalState.bookedDates   = availData.bookedDates || [];
        CalState.blockedRanges = Array.isArray(blocksData) ? blocksData : [];
    } catch (error) {
        console.error('[calendar] Error al cargar disponibilidad:', error);
        showToast('No se pudo cargar la disponibilidad: ' + error.message, 'error');
        CalState.bookedDates   = [];
        CalState.blockedRanges = [];
    }

    renderCalendar();
}

function isManualBlock(dateStr) {
    return CalState.blockedRanges.some(function (r) {
        return dateStr >= r.date_from && dateStr <= r.date_to;
    });
}

function updateCalendarTitle() {
    const title = new Date(CalState.year, CalState.month - 1, 1)
        .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    document.getElementById('calendarTitle').textContent =
        title.charAt(0).toUpperCase() + title.slice(1);
}

function renderCalendarSkeleton() {
    const grid = document.getElementById('calendarGrid');
    // Mantener cabeceras de días si ya existen
    const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    grid.innerHTML = weekdays.map(function (d) {
        return `<div class="cal-weekday">${d}</div>`;
    }).join('');
}

function renderCalendar() {
    const grid     = document.getElementById('calendarGrid');
    const today    = new Date();
    const todayStr = formatDateISO(today);

    const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    let html = weekdays.map(function (d) {
        return `<div class="cal-weekday">${d}</div>`;
    }).join('');

    // Primer día del mes (ajustado: Lunes = 0)
    const firstDay  = new Date(CalState.year, CalState.month - 1, 1);
    const lastDay   = new Date(CalState.year, CalState.month, 0).getDate();
    let startOffset = (firstDay.getDay() + 6) % 7; // 0=Lun, 6=Dom

    // Celdas vacías iniciales
    for (let i = 0; i < startOffset; i++) {
        html += '<div class="cal-day empty"></div>';
    }

    // Días del mes
    for (let day = 1; day <= lastDay; day++) {
        const dateStr  = `${CalState.year}-${pad2(CalState.month)}-${pad2(day)}`;
        const isToday  = dateStr === todayStr;
        const isBooked = CalState.bookedDates.includes(dateStr);

        const isBlock  = isBooked && isManualBlock(dateStr);
        let classes = 'cal-day';
        if (isToday)        classes += ' today';
        if (isBooked && !isBlock) classes += ' occupied';
        else if (isBlock)   classes += ' blocked';
        else if (!isToday)  classes += ' free';
        if (CalState.selectedDay === dateStr) classes += ' selected';

        html += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
    }

    grid.innerHTML = html;

    // Registrar clicks en días ocupados y bloqueados
    grid.querySelectorAll('.cal-day.occupied, .cal-day.blocked').forEach(function (cell) {
        cell.addEventListener('click', function () {
            const date = this.dataset.date;
            CalState.selectedDay = date;

            // Marcar seleccionado visualmente
            grid.querySelectorAll('.cal-day.selected').forEach(function (el) {
                el.classList.remove('selected');
            });
            this.classList.add('selected');

            showCalendarDayInfo(date);
        });
    });
}

/** Muestra la información de la reserva para un día ocupado */
function showCalendarDayInfo(dateStr) {
    const infoEl   = document.getElementById('calendarDayInfo');
    const content  = document.getElementById('calendarDayInfoContent');

    // Buscar la reserva que cubre esa fecha en el estado global
    const booking = AppState.bookings.find(function (b) {
        const checkIn  = b.checkIn  || b.check_in;
        const checkOut = b.checkOut || b.check_out;
        return checkIn && checkOut && dateStr >= checkIn && dateStr < checkOut;
    });

    const dateFormatted = new Date(dateStr + 'T00:00:00').toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    // Comprobar si es un bloqueo manual
    const block = CalState.blockedRanges.find(function (r) {
        return dateStr >= r.date_from && dateStr <= r.date_to;
    });

    if (!booking && block) {
        content.innerHTML = `
            <div class="day-info-title">🚫 ${dateFormatted}</div>
            <div class="day-info-fields">
                <div class="day-info-field"><label>Tipo</label><span>Bloqueo manual</span></div>
                <div class="day-info-field"><label>Desde</label><span>${formatDate(block.date_from)}</span></div>
                <div class="day-info-field"><label>Hasta</label><span>${formatDate(block.date_to)}</span></div>
                <div class="day-info-field"><label>Motivo</label><span>${escapeHtml(block.reason || 'Sin motivo')}</span></div>
            </div>`;
        infoEl.hidden = false;
        return;
    }

    if (!booking) {
        content.innerHTML = `
            <div class="day-info-title">📅 ${dateFormatted}</div>
            <p style="color:var(--text-mid);font-size:14px">Ocupado — sin detalles disponibles localmente.</p>
        `;
        infoEl.hidden = false;
        return;
    }

    const name    = booking.guestName  || booking.guest_name || 'Huésped';
    const checkIn = formatDate(booking.checkIn  || booking.check_in);
    const checkOut= formatDate(booking.checkOut || booking.check_out);
    const nights  = booking.nights || calcNights(booking.checkIn || booking.check_in, booking.checkOut || booking.check_out);
    const price   = formatCurrency(booking.totalPrice || booking.total_price || 0);

    content.innerHTML = `
        <div class="day-info-title">
            📅 ${dateFormatted}
            <button class="btn btn-sm btn-primary" onclick="openBookingModal(${booking.id})">Ver reserva</button>
        </div>
        <div class="day-info-fields">
            <div class="day-info-field">
                <label>Huésped</label>
                <span>${escapeHtml(name)}</span>
            </div>
            <div class="day-info-field">
                <label>Check-in</label>
                <span>${checkIn}</span>
            </div>
            <div class="day-info-field">
                <label>Check-out</label>
                <span>${checkOut}</span>
            </div>
            <div class="day-info-field">
                <label>Noches</label>
                <span>${nights}</span>
            </div>
            <div class="day-info-field">
                <label>Precio</label>
                <span>${price}</span>
            </div>
            <div class="day-info-field">
                <label>Estado</label>
                <span>${renderBadge(booking.status)}</span>
            </div>
        </div>
    `;
    infoEl.hidden = false;
}

/* =========================================================
   SECCIÓN: CONFIGURACIÓN
   ========================================================= */

function initSettingsSection() {
    // Guard: si ya existe el marcador, la sección ya está inicializada
    if (document.getElementById('settingsInitialized')) return;

    // Crear el marcador PRIMERO, antes de cualquier otra operación
    const marker = document.createElement('span');
    marker.id = 'settingsInitialized';
    marker.hidden = true;
    document.querySelector('[data-section="settings"]').appendChild(marker);

    console.log('[settings] Inicializando sección de configuración');
    loadStoredPrices();
    initPasswordForm();
    initPriceForm();
    initMinStayForm();
    initApiCheck();
    showLastAccess();
}

/** Carga los precios guardados en localStorage */
function loadStoredPrices() {
    const basePrice    = localStorage.getItem('pometes_base_price')    || '';
    const cleaningFee  = localStorage.getItem('pometes_cleaning_fee')  || '';
    const basePriceEl  = document.getElementById('basePrice');
    const cleaningEl   = document.getElementById('cleaningFee');

    if (basePriceEl)  basePriceEl.value  = basePrice;
    if (cleaningEl)   cleaningEl.value   = cleaningFee;
}

function initPasswordForm() {
    const form    = document.getElementById('changePasswordForm');
    const errorEl = document.getElementById('passwordChangeError');
    const errorMsg= document.getElementById('passwordChangeErrorMsg');

    if (!form || form.dataset.initialized) return;
    form.dataset.initialized = 'true';

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const currentPw  = document.getElementById('currentPassword').value;
        const newPw      = document.getElementById('newPassword').value;
        const confirmPw  = document.getElementById('confirmPassword').value;

        if (!currentPw || !newPw || !confirmPw) {
            showFormError(errorEl, errorMsg, 'Todos los campos son obligatorios.');
            return;
        }

        if (newPw !== confirmPw) {
            showFormError(errorEl, errorMsg, 'Las contraseñas nuevas no coinciden.');
            return;
        }

        if (newPw.length < 8) {
            showFormError(errorEl, errorMsg, 'La contraseña debe tener al menos 8 caracteres.');
            return;
        }

        errorEl.hidden = true;
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Guardando...';

        try {
            await AuthAPI.changePassword(currentPw, newPw);
            showToast('Contraseña cambiada correctamente.', 'success');
            form.reset();
        } catch (error) {
            showFormError(errorEl, errorMsg, error.message || 'No se pudo cambiar la contraseña.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Cambiar contraseña';
        }
    });
}

function initPriceForm() {
    const form = document.getElementById('priceForm');
    if (!form || form.dataset.initialized) return;
    form.dataset.initialized = 'true';

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        const basePrice   = document.getElementById('basePrice').value;
        const cleaningFee = document.getElementById('cleaningFee').value;

        localStorage.setItem('pometes_base_price',   basePrice);
        localStorage.setItem('pometes_cleaning_fee', cleaningFee);

        showToast('Precios guardados correctamente.', 'success');
    });
}

function initMinStayForm() {
    const form = document.getElementById('minStayForm');
    if (!form || form.dataset.initialized) return;
    form.dataset.initialized = 'true';

    // Cargar valor actual
    SettingsAPI.getAll().then(function (settings) {
        const input = document.getElementById('minStayNights');
        if (input && settings.min_stay_nights) {
            input.value = settings.min_stay_nights;
        }
    }).catch(function () {});

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const val    = parseInt(document.getElementById('minStayNights').value);
        const errEl  = document.getElementById('minStayError');
        const msgEl  = document.getElementById('minStayErrorMsg');
        const btn    = form.querySelector('button[type="submit"]');

        if (errEl) errEl.hidden = true;

        if (!val || val < 1 || val > 30) {
            if (errEl && msgEl) { msgEl.textContent = 'Introduce un valor entre 1 y 30.'; errEl.hidden = false; }
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Guardando...';
        try {
            await SettingsAPI.update('min_stay_nights', val);
            showToast('Estancia mínima actualizada a ' + val + ' ' + (val === 1 ? 'noche' : 'noches'), 'success');
        } catch (err) {
            if (errEl && msgEl) { msgEl.textContent = err.message || 'No se pudo guardar.'; errEl.hidden = false; }
        } finally {
            btn.disabled = false;
            btn.textContent = 'Guardar';
        }
    });
}

function initApiCheck() {
    const btn = document.getElementById('checkApiBtn');
    if (!btn || btn.dataset.initialized) return;
    btn.dataset.initialized = 'true';

    btn.addEventListener('click', checkApiStatus);
    checkApiStatus(); // verificar al entrar
}

async function checkApiStatus() {
    const statusEl = document.getElementById('apiStatus');
    if (!statusEl) return;

    statusEl.innerHTML = '<span class="status-dot status-dot-checking"></span> Verificando...';

    try {
        const result = await AuthAPI.ping();
        if (result !== null) {
            statusEl.innerHTML = '<span class="status-dot status-dot-ok"></span> Conectado';
        } else {
            statusEl.innerHTML = '<span class="status-dot status-dot-error"></span> Sin respuesta';
        }
    } catch {
        statusEl.innerHTML = '<span class="status-dot status-dot-error"></span> Error de conexión';
    }
}

function showLastAccess() {
    const el   = document.getElementById('lastAccess');
    const raw  = localStorage.getItem('pometes_last_access');
    if (!el) return;

    if (raw) {
        el.textContent = new Date(raw).toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } else {
        el.textContent = 'Primera sesión';
    }
}

function showFormError(errorEl, msgEl, msg) {
    msgEl.textContent = msg;
    errorEl.hidden = false;
}

/* =========================================================
   SECCIÓN: CANALES EXTERNOS
   ========================================================= */

const ChannelsState = { items: [], initialized: false };

function initChannelsSection() {
    if (ChannelsState.initialized) { renderChannelsList(); return; }
    ChannelsState.initialized = true;

    const form = document.getElementById('channelForm');
    if (form) form.addEventListener('submit', handleChannelSubmit);

    loadChannels();
}

async function loadChannels() {
    try {
        const data = await apiFetch('/channels');
        ChannelsState.items = Array.isArray(data) ? data : [];
        renderChannelsList();
    } catch (err) {
        showToast('No se pudieron cargar los canales: ' + err.message, 'error');
    }
}

function renderChannelsList() {
    const el = document.getElementById('channelsList');
    if (!el) return;

    if (ChannelsState.items.length === 0) {
        el.innerHTML = '<div class="ch-empty"><div style="font-size:32px;margin-bottom:8px">🔗</div><p>No hay canales configurados todavía.</p></div>';
        return;
    }

    const PLATFORM_LABELS = { airbnb: '🏠 Airbnb', booking: '📱 Booking.com', holidu: '🏡 Holidu' };

    el.innerHTML = ChannelsState.items.map(function (ch) {
        const label     = PLATFORM_LABELS[ch.platform] || ch.platform;
        const syncText  = ch.last_synced_at
            ? 'Última sync: ' + new Date(ch.last_synced_at).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
            : 'Nunca sincronizado';
        const statusCls = ch.sync_error ? 'ch-status-error' : (ch.last_synced_at ? 'ch-status-ok' : 'ch-status-pending');
        const statusTxt = ch.sync_error ? '⚠️ Error' : (ch.last_synced_at ? '✅ OK' : '⏳ Pendiente');

        return `
            <div class="ch-item">
                <div class="ch-item-left">
                    <div class="ch-platform">${label}</div>
                    <div class="ch-sync-info">${syncText}</div>
                    ${ch.sync_error ? `<div class="ch-error-msg">${escapeHtml(ch.sync_error)}</div>` : ''}
                </div>
                <div class="ch-item-right">
                    <span class="ch-status ${statusCls}">${statusTxt}</span>
                    <label class="ch-toggle" title="${ch.enabled ? 'Desactivar' : 'Activar'}">
                        <input type="checkbox" class="ch-enabled-cb" data-id="${ch.id}"
                               ${ch.enabled ? 'checked' : ''}>
                        <span class="ch-toggle-slider"></span>
                    </label>
                    <button class="btn btn-ghost btn-sm ch-delete-btn" data-id="${ch.id}" title="Eliminar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        </svg>
                    </button>
                </div>
            </div>`;
    }).join('');

    el.querySelectorAll('.ch-enabled-cb').forEach(function (cb) {
        cb.addEventListener('change', function () {
            updateChannelEnabled(this.dataset.id, this.checked);
        });
    });

    el.querySelectorAll('.ch-delete-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const id = this.dataset.id;
            const ch = ChannelsState.items.find(function (c) { return String(c.id) === String(id); });
            showConfirm({
                icon: '🔗', title: '¿Eliminar canal?',
                message: ch ? `Se eliminará la integración con ${ch.platform}.` : '',
                acceptText: 'Eliminar', acceptClass: 'btn-danger',
                onAccept: function () { deleteChannel(id); }
            });
        });
    });
}

async function handleChannelSubmit(e) {
    e.preventDefault();
    const platform = document.getElementById('chPlatform').value;
    const url      = document.getElementById('chIcalUrl').value.trim();
    const btn      = document.getElementById('chSubmitBtn');
    const errEl    = document.getElementById('chFormError');
    const msgEl    = document.getElementById('chFormErrorMsg');

    if (errEl) errEl.hidden = true;
    if (!platform) { if (errEl && msgEl) { msgEl.textContent = 'Selecciona una plataforma.'; errEl.hidden = false; } return; }

    btn.disabled = true; btn.textContent = 'Guardando...';
    try {
        const created = await apiFetch('/channels', { method: 'POST', body: JSON.stringify({ platform, ical_import_url: url || null }) });
        ChannelsState.items.push(created);
        renderChannelsList();
        e.target.reset();
        showToast('Canal añadido correctamente', 'success');
    } catch (err) {
        if (errEl && msgEl) { msgEl.textContent = err.message || 'No se pudo guardar.'; errEl.hidden = false; }
    } finally {
        btn.disabled = false; btn.textContent = 'Añadir canal';
    }
}

async function updateChannelEnabled(id, enabled) {
    const ch = ChannelsState.items.find(function (c) { return String(c.id) === String(id); });
    try {
        await apiFetch(`/channels/${id}`, { method: 'PUT', body: JSON.stringify({ enabled, ical_import_url: ch?.ical_import_url }) });
        if (ch) ch.enabled = enabled;
        showToast(`Canal ${enabled ? 'activado' : 'desactivado'}`, 'success');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
        renderChannelsList(); // revertir toggle
    }
}

async function deleteChannel(id) {
    try {
        await apiFetch(`/channels/${id}`, { method: 'DELETE' });
        ChannelsState.items = ChannelsState.items.filter(function (c) { return String(c.id) !== String(id); });
        renderChannelsList();
        showToast('Canal eliminado', 'success');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

/* =========================================================
   MODAL DE DETALLE DE RESERVA
   ========================================================= */

/**
 * Abre el modal con el detalle de una reserva.
 * Primero busca en el estado local; si no está, llama a la API.
 */
async function openBookingModal(id) {
    const overlay = document.getElementById('bookingModalOverlay');
    const body    = document.getElementById('modalBody');
    const footer  = document.getElementById('modalFooter');
    const title   = document.getElementById('modalTitle');

    // Mostrar modal vacío con loading
    title.textContent   = 'Cargando reserva...';
    body.innerHTML      = '<div style="text-align:center;padding:40px"><div class="loading-spinner" style="margin:0 auto"></div></div>';
    footer.innerHTML    = '';
    overlay.hidden      = false;

    try {
        // Intentar obtener de la caché local primero
        let booking = AppState.bookings.find(function (b) { return String(b.id) === String(id); });

        // Si no está en caché, consultar la API
        if (!booking) {
            const data = await BookingsAPI.getById(id);
            booking = data.booking || data;
        }

        renderBookingModal(booking);

    } catch (error) {
        body.innerHTML = `<div class="empty-state"><p>No se pudo cargar la reserva: ${escapeHtml(error.message)}</p></div>`;
        footer.innerHTML = '<button class="btn btn-ghost" id="modalClose2">Cerrar</button>';
        document.getElementById('modalClose2').addEventListener('click', closeBookingModal);
    }
}

/** Renderiza el contenido del modal con los datos de la reserva */
function renderBookingModal(booking) {
    const body   = document.getElementById('modalBody');
    const footer = document.getElementById('modalFooter');
    const title  = document.getElementById('modalTitle');

    const name     = booking.guestName  || booking.guest_name  || 'Sin nombre';
    const email    = booking.guestEmail || booking.guest_email || '—';
    const phone    = booking.guestPhone || booking.guest_phone || '—';
    const checkIn  = formatDate(booking.checkIn  || booking.check_in);
    const checkOut = formatDate(booking.checkOut || booking.check_out);
    const nights   = booking.nights || calcNights(booking.checkIn || booking.check_in, booking.checkOut || booking.check_out);
    const guests   = booking.guests || booking.numGuests || booking.num_guests || '—';
    const price    = formatCurrency(booking.totalPrice || booking.total_price || 0);
    const notes    = booking.notes || '';
    const source   = renderSource(booking.source);
    const createdAt= booking.createdAt || booking.created_at
        ? new Date(booking.createdAt || booking.created_at).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
        : '—';

    title.textContent = `Reserva #${booking.id}`;

    body.innerHTML = `
        <div class="booking-detail-grid">
            <!-- Datos del huésped -->
            <div class="booking-detail-section">
                <h3>👤 Huésped</h3>
                <div class="detail-field">
                    <label>Nombre</label>
                    <span>${escapeHtml(name)}</span>
                </div>
                <div class="detail-field">
                    <label>Email</label>
                    <span><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></span>
                </div>
                <div class="detail-field">
                    <label>Teléfono</label>
                    <span><a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></span>
                </div>
                <div class="detail-field">
                    <label>Huéspedes</label>
                    <span>${guests}</span>
                </div>
            </div>

            <!-- Detalles de la estancia -->
            <div class="booking-detail-section">
                <h3>🗓️ Estancia</h3>
                <div class="detail-field">
                    <label>Check-in</label>
                    <span>${checkIn}</span>
                </div>
                <div class="detail-field">
                    <label>Check-out</label>
                    <span>${checkOut}</span>
                </div>
                <div class="detail-field">
                    <label>Noches</label>
                    <span>${nights}</span>
                </div>
                <div class="detail-field">
                    <label>Precio total</label>
                    <span style="font-size:18px;font-weight:700;color:var(--text)">${price}</span>
                </div>
                <div id="modalPricingBreakdown" style="margin-top:12px">
                    <div class="skeleton" style="height:60px;border-radius:6px"></div>
                </div>
            </div>

            <!-- Estado y origen -->
            <div class="booking-detail-section">
                <h3>📊 Estado</h3>
                <div class="detail-field">
                    <label>Estado actual</label>
                    <span>${renderBadge(booking.status)}</span>
                </div>
                <div class="detail-field">
                    <label>Origen</label>
                    <span>${source}</span>
                </div>
                <div class="detail-field">
                    <label>Fecha de solicitud</label>
                    <span>${createdAt}</span>
                </div>
                <div class="detail-field">
                    <label>ID reserva</label>
                    <span style="font-family:monospace;font-size:13px">#${booking.id}</span>
                </div>
            </div>

            <!-- Notas -->
            <div class="booking-detail-section">
                <h3>📝 Notas</h3>
                <div class="booking-notes-box ${!notes ? 'booking-notes-empty' : ''}">
                    ${notes ? escapeHtml(notes) : 'Sin notas adicionales'}
                </div>
            </div>
        </div>
    `;

    // Servicios de la reserva
    const services = booking.services || [];
    if (services.length > 0) {
        body.innerHTML += `
            <div class="booking-detail-section" style="grid-column:1/-1">
                <h3>🛎️ Servicios</h3>
                ${services.map(function (s) {
                    return `<div style="display:flex;justify-content:space-between;align-items:center;
                                        padding:6px 0;border-bottom:1px solid var(--border);font-size:14px">
                        <span>${escapeHtml(s.name)} ${s.mandatory ? '<span class="badge badge-pending" style="font-size:10px">obligatorio</span>' : ''}</span>
                        <strong>${parseFloat(s.price) > 0 ? formatCurrency(s.price) : 'Incluido'}</strong>
                    </div>`;
                }).join('')}
            </div>`;
    }

    // Fianza
    const depositAmount = booking.deposit_amount;
    const depositStatus = booking.deposit_status;
    if (depositAmount) {
        const depositLabels = { pending: '⏳ Pendiente', paid: '✅ Cobrada', returned: '↩️ Devuelta', retained: '⚠️ Retenida' };
        const depositColors = { pending: '#FEF9EC', paid: '#D1F2E0', returned: '#EBF4FB', retained: '#FCE4E4' };
        body.innerHTML += `
            <div class="booking-detail-section" id="depositSection">
                <h3>💰 Fianza</h3>
                <div class="detail-field">
                    <label>Importe requerido</label>
                    <span style="font-size:18px;font-weight:700">${formatCurrency(depositAmount)}</span>
                </div>
                <div class="detail-field">
                    <label>Estado</label>
                    <span id="depositStatusBadge" style="background:${depositColors[depositStatus] || '#f9f6f0'};
                           padding:4px 10px;border-radius:10px;font-weight:600;font-size:13px">
                        ${depositLabels[depositStatus] || '—'}
                    </span>
                </div>
                ${booking.deposit_notes ? `<div class="detail-field"><label>Notas</label><span>${escapeHtml(booking.deposit_notes)}</span></div>` : ''}
                <div id="depositActionBtns" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
                    ${depositStatus === 'pending' ? `<button class="btn btn-success btn-sm" onclick="updateDeposit(${booking.id},'paid')">✅ Marcar cobrada</button>` : ''}
                    ${depositStatus === 'paid'    ? `<button class="btn btn-ghost btn-sm" onclick="updateDeposit(${booking.id},'returned')">↩️ Devolver</button>
                                                    <button class="btn btn-danger btn-sm" onclick="promptRetainDeposit(${booking.id})">⚠️ Retener</button>` : ''}
                </div>
            </div>`;
    }

    // Motivo de cancelación (si aplica)
    if (booking.status === 'cancelled' && (booking.cancellation_reason)) {
        body.innerHTML += `
            <div class="booking-detail-section" style="grid-column:1/-1">
                <h3>🚫 Motivo de cancelación</h3>
                <div class="booking-notes-box">${escapeHtml(booking.cancellation_reason)}</div>
            </div>`;
    }

    // Cargar desglose de precio de forma asíncrona
    const checkInRaw  = booking.checkIn  || booking.check_in;
    const checkOutRaw = booking.checkOut || booking.check_out;
    if (checkInRaw && checkOutRaw) {
        loadModalPricingBreakdown(checkInRaw, checkOutRaw);
    }

    // Notas del administrador
    const adminNotes = booking.admin_notes || '';
    body.querySelector('.booking-detail-grid')?.insertAdjacentHTML('beforeend', `
        <div class="booking-detail-section" style="grid-column:1/-1">
            <h3>🗒️ Notas del administrador <span style="font-weight:400;color:var(--text-light)">(solo visibles aquí)</span></h3>
            <textarea id="adminNotesInput" rows="3" placeholder="Añade notas internas sobre esta reserva…"
                      style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:6px;
                             font-size:14px;resize:vertical;font-family:inherit">${escapeHtml(adminNotes)}</textarea>
            <button class="btn btn-ghost btn-sm" onclick="saveAdminNotes(${booking.id})" style="margin-top:8px">
                💾 Guardar notas
            </button>
        </div>`);

    // Cargar historial de emails de forma asíncrona
    loadEmailHistory(booking.id);

    // Botones de acción según el estado
    footer.innerHTML = '';

    const closeBtn = document.createElement('button');
    closeBtn.className   = 'btn btn-ghost';
    closeBtn.textContent = 'Cerrar';
    closeBtn.addEventListener('click', closeBookingModal);
    footer.appendChild(closeBtn);

    if (booking.status === 'pending') {
        const confirmBtn = document.createElement('button');
        confirmBtn.className   = 'btn btn-success';
        confirmBtn.innerHTML   = '✅ Confirmar reserva';
        confirmBtn.addEventListener('click', function () {
            closeBookingModal();
            confirmBooking(booking.id);
        });
        footer.appendChild(confirmBtn);
    }

    if (booking.status !== 'cancelled') {
        const cancelBtn = document.createElement('button');
        cancelBtn.className   = 'btn btn-danger';
        cancelBtn.innerHTML   = '❌ Cancelar reserva';
        cancelBtn.addEventListener('click', function () {
            closeBookingModal();
            cancelBooking(booking.id);
        });
        footer.appendChild(cancelBtn);
    }
}

/** Carga y renderiza el historial de emails en el modal */
async function loadEmailHistory(bookingId) {
    // Insertar placeholder en el body del modal
    const body = document.getElementById('modalBody');
    if (!body) return;

    const historyDiv = document.createElement('div');
    historyDiv.id = 'modalEmailHistory';
    historyDiv.style.cssText = 'grid-column:1/-1;margin-top:4px';
    historyDiv.innerHTML = `
        <div class="booking-detail-section">
            <h3>📧 Emails enviados</h3>
            <div style="font-size:13px;color:var(--text-light)">Cargando...</div>
        </div>`;
    body.querySelector('.booking-detail-grid')?.appendChild(historyDiv);

    try {
        const logs = await BookingsAPI.getEmailLogs(bookingId);
        if (!logs || logs.length === 0) {
            historyDiv.innerHTML = `<div class="booking-detail-section"><h3>📧 Emails enviados</h3>
                <div style="font-size:13px;color:var(--text-light)">No hay emails registrados.</div></div>`;
            return;
        }

        const TYPE_LABELS = {
            request_guest:   'Solicitud → Huésped',
            request_admin:   'Solicitud → Admin',
            confirmed_guest: 'Confirmación → Huésped',
            confirmed_admin: 'Confirmación → Admin',
            cancelled_guest: 'Cancelación → Huésped',
            reminder_admin:  'Recordatorio → Admin',
        };

        const rows = logs.map(function (l) {
            const label = TYPE_LABELS[l.type] || l.type;
            const date  = new Date(l.sent_at).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
            const icon  = l.success ? '✅' : '❌';
            return `<div style="display:flex;justify-content:space-between;align-items:center;
                                padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
                        <span>${icon} ${label}</span>
                        <span style="color:var(--text-light)">${date}</span>
                    </div>`;
        }).join('');

        historyDiv.innerHTML = `<div class="booking-detail-section">
            <h3>📧 Emails enviados (${logs.length})</h3>
            <div>${rows}</div>
        </div>`;
    } catch {
        historyDiv.remove();
    }
}

/** Carga y renderiza el desglose de precio en el modal */
async function loadModalPricingBreakdown(checkIn, checkOut) {
    const el = document.getElementById('modalPricingBreakdown');
    if (!el) return;

    try {
        const pricing = await PricingAPI.getQuote(checkIn, checkOut);
        el.innerHTML = renderPricingBreakdownHtml(pricing);
    } catch (err) {
        console.warn('[pricing] No se pudo cargar el desglose:', err.message);
        el.remove();
    }
}

/** Genera el HTML del desglose de precios */
function renderPricingBreakdownHtml(pricing) {
    const { nights, totalPrice, breakdown } = pricing;

    // Si solo hay un período con precio uniforme, mostrar versión compacta
    if (breakdown.length === 1) {
        return `
            <div style="background:#f9f6f0;border-radius:6px;padding:10px 14px;
                        font-family:Arial,sans-serif;font-size:13px;color:#666;margin-top:4px">
                💶 ${nights} noche${nights !== 1 ? 's' : ''} × ${formatCurrency(breakdown[0].pricePerNight)}
                = <strong style="color:var(--text)">${formatCurrency(totalPrice)}</strong>
            </div>`;
    }

    // Desglose completo con tabla cuando hay varias tarifas
    const rows = breakdown.map(function (b) {
        return `
            <tr>
                <td style="padding:6px 10px;color:#555">${escapeHtml(b.name)}</td>
                <td style="padding:6px 10px;text-align:center">${b.nights}</td>
                <td style="padding:6px 10px;text-align:right">${formatCurrency(b.pricePerNight)}</td>
                <td style="padding:6px 10px;text-align:right;font-weight:600">${formatCurrency(b.subtotal)}</td>
            </tr>`;
    }).join('');

    return `
        <div style="margin-top:8px;border:1px solid #e8e0d0;border-radius:6px;overflow:hidden">
            <div style="background:#f0ece4;padding:6px 10px;font-family:Arial,sans-serif;
                        font-size:11px;font-weight:700;color:#2C5F7A;letter-spacing:1px;
                        text-transform:uppercase">
                💶 Desglose del precio
            </div>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse">
                <thead>
                    <tr style="background:#faf7f3">
                        <th style="padding:6px 10px;text-align:left;color:#999;font-weight:normal">Período</th>
                        <th style="padding:6px 10px;text-align:center;color:#999;font-weight:normal">Noches</th>
                        <th style="padding:6px 10px;text-align:right;color:#999;font-weight:normal">Precio/noche</th>
                        <th style="padding:6px 10px;text-align:right;color:#999;font-weight:normal">Subtotal</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr style="background:#f0ece4;border-top:2px solid #e8e0d0">
                        <td style="padding:8px 10px;font-weight:700;color:#2C5F7A" colspan="2">
                            Total — ${nights} noche${nights !== 1 ? 's' : ''}
                        </td>
                        <td></td>
                        <td style="padding:8px 10px;text-align:right;font-weight:700;
                                   font-size:15px;color:#2C5F7A">
                            ${formatCurrency(totalPrice)}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>`;
}

function closeBookingModal() {
    document.getElementById('bookingModalOverlay').hidden = true;
}

async function saveAdminNotes(bookingId) {
    const textarea = document.getElementById('adminNotesInput');
    if (!textarea) return;
    try {
        await apiFetch(`/bookings/${bookingId}/notes`, {
            method: 'PUT',
            body: JSON.stringify({ admin_notes: textarea.value })
        });
        updateBookingInState(bookingId, { admin_notes: textarea.value });
        showToast('Notas guardadas correctamente', 'success');
    } catch (err) {
        showToast('Error al guardar notas: ' + err.message, 'error');
    }
}

async function updateDeposit(bookingId, status, notes) {
    try {
        await apiFetch(`/bookings/${bookingId}/deposit`, {
            method: 'PUT',
            body: JSON.stringify({ status, notes: notes || undefined })
        });
        updateBookingInState(bookingId, { deposit_status: status, deposit_notes: notes || null });
        showToast(`Fianza marcada como: ${status}`, 'success');
        openBookingModal(bookingId); // recargar modal
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

function promptRetainDeposit(bookingId) {
    showConfirm({
        icon: '⚠️',
        title: 'Retener fianza',
        message: '¿Deseas retener la fianza? Indica el motivo:',
        extra: `<div style="margin-top:12px">
                  <textarea id="retainReasonInput" rows="2" placeholder="Motivo de retención…"
                    style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;resize:none;font-family:inherit"></textarea>
                </div>`,
        acceptText: 'Retener fianza',
        acceptClass: 'btn-danger',
        onAccept: function () {
            const reason = document.getElementById('retainReasonInput')?.value || '';
            updateDeposit(bookingId, 'retained', reason);
        }
    });
}

/** Registra los eventos del modal de reserva — llamado desde el DOMContentLoaded central */
function initModalBindings() {
    document.getElementById('bookingModalOverlay').addEventListener('click', function (e) {
        if (e.target === this) closeBookingModal();
    });

    document.getElementById('modalClose').addEventListener('click', closeBookingModal);

    // Cerrar modales y confirmaciones con la tecla Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (!document.getElementById('bookingModalOverlay').hidden) closeBookingModal();
            if (!document.getElementById('confirmOverlay').hidden) closeConfirm();
        }
    });
}

/* =========================================================
   TOAST NOTIFICATIONS
   ========================================================= */

/**
 * Muestra una notificación temporal.
 * @param {string} message  - Texto del mensaje
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} [duration=3000] - Milisegundos hasta auto-cerrar
 */
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast     = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon"></span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    // Auto-cerrar después del tiempo indicado
    setTimeout(function () {
        toast.classList.add('exiting');
        toast.addEventListener('animationend', function () { toast.remove(); }, { once: true });
    }, duration);
}

/* =========================================================
   DIÁLOGO DE CONFIRMACIÓN
   ========================================================= */

let _confirmCallback = null;

/**
 * Muestra un diálogo de confirmación personalizable.
 * @param {object} opts
 * @param {string}   opts.icon
 * @param {string}   opts.title
 * @param {string}   opts.message
 * @param {string}   [opts.acceptText='Aceptar']
 * @param {string}   [opts.acceptClass='btn-danger']
 * @param {Function} opts.onAccept
 */
function showConfirm(opts) {
    document.getElementById('confirmIcon').textContent    = opts.icon    || '❓';
    document.getElementById('confirmTitle').textContent   = opts.title   || '¿Estás seguro?';
    document.getElementById('confirmMessage').textContent = opts.message || '';

    // Slot extra (ej: select de motivo de cancelación)
    const extraEl = document.getElementById('confirmExtra');
    if (extraEl) extraEl.innerHTML = opts.extra || '';

    const acceptBtn = document.getElementById('confirmAccept');
    acceptBtn.textContent = opts.acceptText  || 'Aceptar';
    acceptBtn.className   = `btn ${opts.acceptClass || 'btn-danger'}`;

    _confirmCallback = opts.onAccept || null;

    document.getElementById('confirmOverlay').hidden = false;
}

function closeConfirm() {
    document.getElementById('confirmOverlay').hidden = true;
    _confirmCallback = null;
}

/** Registra los eventos del diálogo de confirmación — llamado desde el DOMContentLoaded central */
function initConfirmBindings() {
    document.getElementById('confirmCancel').addEventListener('click', closeConfirm);

    document.getElementById('confirmAccept').addEventListener('click', function () {
        // Capturar la referencia ANTES de que closeConfirm la anule
        const cb = _confirmCallback;
        closeConfirm();
        if (typeof cb === 'function') cb();
    });

    // Cerrar al hacer click fuera del diálogo
    document.getElementById('confirmOverlay').addEventListener('click', function (e) {
        if (e.target === this) closeConfirm();
    });
}

/* =========================================================
   UTILIDADES
   ========================================================= */

/** Formatea una fecha ISO a dd/mm/aaaa */
function formatDate(isoString) {
    if (!isoString) return '—';
    const [y, m, d] = isoString.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
}

/** Devuelve la fecha en formato yyyy-mm-dd */
function formatDateISO(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Formatea un número como moneda EUR */
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
}

/** Rellena con cero a la izquierda */
function pad2(n) { return String(n).padStart(2, '0'); }

/** Calcula las noches entre dos fechas ISO */
function calcNights(checkIn, checkOut) {
    if (!checkIn || !checkOut) return '—';
    const diff = new Date(checkOut) - new Date(checkIn);
    return Math.round(diff / 86400000);
}

/** Obtiene las iniciales de un nombre */
function getInitials(name) {
    return (name || '?').split(' ').slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
}

/** Escapa HTML para evitar XSS */
function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** Genera el HTML de un badge de estado */
function renderBadge(status) {
    const map = {
        pending:   ['badge-pending',   'Pendiente'],
        confirmed: ['badge-confirmed', 'Confirmada'],
        cancelled: ['badge-cancelled', 'Cancelada']
    };
    const [cls, label] = map[status] || ['badge-pending', status || '—'];
    return `<span class="badge ${cls}">${label}</span>`;
}

/** Genera el HTML del origen con icono */
function renderSource(source) {
    const map = {
        direct:  '🌐 Web directa',
        airbnb:  '🏠 Airbnb',
        booking: '📱 Booking'
    };
    return `<span class="source-badge">${map[source] || source || '—'}</span>`;
}

/** Muestra/oculta el loading global */
function setGlobalLoading(visible) {
    document.getElementById('loadingOverlay').hidden = !visible;
}
