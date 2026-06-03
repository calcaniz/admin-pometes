/* =========================================================
   ANALYTICS.JS — Analíticas básicas del panel
   Casa Rural Pometes · Panel de Administración
   ========================================================= */

'use strict';

function initAnalyticsSection() {
    renderAnalytics(AppState.bookings);
}

// Recarga datos desde la API y renderiza (llamado desde navigateTo)
async function loadAndRenderAnalytics() {
    const refreshBtn = document.getElementById('analyticsRefreshBtn');
    if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.textContent = '⏳ Actualizando...'; }

    try {
        const data = await BookingsAPI.getAll();
        const list = Array.isArray(data) ? data : (data.bookings || []);
        AppState.bookings   = list;
        BookingsState.all   = list;
        renderAnalytics(list);
        updatePendingBadge();
    } catch (err) {
        showToast('Error al cargar datos: ' + err.message, 'error');
        renderAnalytics(AppState.bookings); // usar caché si falla
    } finally {
        if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = '🔄 Actualizar'; }
    }
}

function renderAnalytics(bookings) {
    renderAnalyticsOverview(bookings);
    renderRevenueByMonth(bookings);
    renderBookingsBySource(bookings);
}

// ── Tarjetas resumen ──────────────────────────────────────

function renderAnalyticsOverview(bookings) {
    const el = document.getElementById('analyticsOverview');
    if (!el) return;

    const confirmed  = bookings.filter(b => b.status === 'confirmed');
    const cancelled  = bookings.filter(b => b.status === 'cancelled');
    const totalRevenue = confirmed.reduce((s, b) => s + Number(b.total_price || b.totalPrice || 0), 0);
    const avgStay    = confirmed.length > 0
        ? (confirmed.reduce((s, b) => s + calcNights(b.check_in || b.checkIn, b.check_out || b.checkOut), 0) / confirmed.length).toFixed(1)
        : '—';
    const confirmRate = bookings.filter(b => b.status !== 'pending').length > 0
        ? Math.round(confirmed.length / bookings.filter(b => b.status !== 'pending').length * 100)
        : '—';

    el.innerHTML = `
        <div class="metric-card">
            <div class="metric-icon metric-icon-teal">📊</div>
            <div class="metric-info">
                <span class="metric-value">${bookings.length}</span>
                <span class="metric-label">Reservas totales</span>
            </div>
        </div>
        <div class="metric-card">
            <div class="metric-icon metric-icon-success">💰</div>
            <div class="metric-info">
                <span class="metric-value">${formatCurrency(totalRevenue)}</span>
                <span class="metric-label">Ingresos totales</span>
            </div>
        </div>
        <div class="metric-card">
            <div class="metric-icon metric-icon-warning">🌙</div>
            <div class="metric-info">
                <span class="metric-value">${avgStay}</span>
                <span class="metric-label">Noches media por estancia</span>
            </div>
        </div>
        <div class="metric-card">
            <div class="metric-icon metric-icon-danger">✅</div>
            <div class="metric-info">
                <span class="metric-value">${confirmRate}${confirmRate !== '—' ? '%' : ''}</span>
                <span class="metric-label">Tasa de confirmación</span>
            </div>
        </div>`;
}

// ── Ingresos por mes (últimos 12 meses) ──────────────────

function renderRevenueByMonth(bookings) {
    const el = document.getElementById('analyticsRevenueByMonth');
    if (!el) return;

    const confirmed = bookings.filter(b => b.status === 'confirmed');
    const months = {};

    // Últimos 12 meses
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months[key] = { label: d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }), revenue: 0, count: 0 };
    }

    confirmed.forEach(function (b) {
        const dateStr = (b.check_in || b.checkIn || '').slice(0, 7);
        if (months[dateStr]) {
            months[dateStr].revenue += Number(b.total_price || b.totalPrice || 0);
            months[dateStr].count++;
        }
    });

    const entries   = Object.values(months);
    const maxRev    = Math.max(...entries.map(e => e.revenue), 1);

    if (entries.every(e => e.revenue === 0)) {
        el.innerHTML = '<div class="an-empty">Sin datos de ingresos en los últimos 12 meses</div>';
        return;
    }

    el.innerHTML = `
        <div class="an-bar-chart">
            ${entries.map(function (e) {
                const pct = Math.round(e.revenue / maxRev * 100);
                return `
                    <div class="an-bar-col">
                        <div class="an-bar-value">${e.revenue > 0 ? formatCurrency(e.revenue) : ''}</div>
                        <div class="an-bar-wrap">
                            <div class="an-bar" style="height:${pct}%" title="${formatCurrency(e.revenue)}"></div>
                        </div>
                        <div class="an-bar-label">${e.label}</div>
                    </div>`;
            }).join('')}
        </div>`;
}

// ── Reservas por canal ───────────────────────────────────

function renderBookingsBySource(bookings) {
    const el = document.getElementById('analyticsBookingsBySource');
    if (!el) return;

    const sourceMap = { direct: { label: '🌐 Web directa', count: 0, revenue: 0 },
                        airbnb:  { label: '🏠 Airbnb',      count: 0, revenue: 0 },
                        booking: { label: '📱 Booking',     count: 0, revenue: 0 } };

    bookings.filter(b => b.status !== 'cancelled').forEach(function (b) {
        const src = b.source || 'direct';
        if (!sourceMap[src]) sourceMap[src] = { label: src, count: 0, revenue: 0 };
        sourceMap[src].count++;
        sourceMap[src].revenue += Number(b.total_price || b.totalPrice || 0);
    });

    const total = Object.values(sourceMap).reduce((s, v) => s + v.count, 0) || 1;

    el.innerHTML = `
        <table class="an-source-table">
            <thead>
                <tr>
                    <th>Canal</th>
                    <th>Reservas</th>
                    <th>% del total</th>
                    <th>Ingresos</th>
                </tr>
            </thead>
            <tbody>
                ${Object.values(sourceMap).map(function (s) {
                    const pct = Math.round(s.count / total * 100);
                    return `
                        <tr>
                            <td>${s.label}</td>
                            <td>${s.count}</td>
                            <td>
                                <div class="an-pct-bar">
                                    <div class="an-pct-fill" style="width:${pct}%"></div>
                                    <span>${pct}%</span>
                                </div>
                            </td>
                            <td>${formatCurrency(s.revenue)}</td>
                        </tr>`;
                }).join('')}
            </tbody>
        </table>`;
}
