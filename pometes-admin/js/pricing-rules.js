/* =========================================================
   PRICING-RULES.JS — Gestión de reglas de precios por temporada
   Casa Rural Pometes · Panel de Administración
   ========================================================= */

'use strict';

const PricingRulesState = {
    items:       [],
    editingId:   null,
    initialized: false
};

function initPricingRulesSection() {
    if (PricingRulesState.initialized) {
        renderPricingRulesList();
        return;
    }
    PricingRulesState.initialized = true;

    const form = document.getElementById('pricingRuleForm');
    if (form) {
        form.addEventListener('submit', handlePricingRuleSubmit);
    }

    const cancelBtn = document.getElementById('prCancelEdit');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelEditRule);
    }

    loadPricingRules();
}

async function loadPricingRules() {
    const list = document.getElementById('pricingRulesList');
    if (list) list.innerHTML = '<div class="pr-loading">Cargando reglas de precio...</div>';

    try {
        const data = await PricingRulesAPI.getAll();
        PricingRulesState.items = Array.isArray(data) ? data : [];
        renderPricingRulesList();
    } catch (err) {
        console.error('[pricing-rules] Error al cargar:', err);
        showToast('No se pudieron cargar las reglas de precio: ' + err.message, 'error');
        if (list) list.innerHTML = '<div class="pr-empty">Error al cargar las reglas</div>';
    }
}

function renderPricingRulesList() {
    const list = document.getElementById('pricingRulesList');
    if (!list) return;

    const items = PricingRulesState.items;

    if (items.length === 0) {
        list.innerHTML = `
            <div class="pr-empty">
                <div style="font-size:32px;margin-bottom:8px">💰</div>
                <p>No hay reglas de temporada.<br>
                   <span style="font-size:13px;color:var(--text-light)">
                     Se aplicará el precio base (90 €/noche) a todas las fechas.
                   </span>
                </p>
            </div>`;
        return;
    }

    const today = new Date().toISOString().slice(0, 10);

    list.innerHTML = `
        <table class="pr-table">
            <thead>
                <tr>
                    <th>Nombre</th>
                    <th>Desde</th>
                    <th>Hasta</th>
                    <th>Precio/noche</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(function (rule) {
                    const isPast   = rule.date_to < today;
                    const isActive = rule.date_from <= today && rule.date_to >= today;
                    let statusClass = 'pr-status-upcoming';
                    let statusLabel = 'Próxima';
                    if (isPast)   { statusClass = 'pr-status-past';   statusLabel = 'Pasada'; }
                    if (isActive) { statusClass = 'pr-status-active'; statusLabel = 'Activa'; }

                    const isEditing = String(PricingRulesState.editingId) === String(rule.id);

                    return `
                        <tr class="${isPast ? 'pr-row--past' : ''} ${isEditing ? 'pr-row--editing' : ''}">
                            <td class="pr-col-name">${escapeHtml(rule.name)}</td>
                            <td class="pr-col-date">${formatDate(rule.date_from)}</td>
                            <td class="pr-col-date">${formatDate(rule.date_to)}</td>
                            <td class="pr-col-price">
                                <strong>${formatCurrency(rule.price_per_night)}</strong>
                            </td>
                            <td><span class="pr-status ${statusClass}">${statusLabel}</span></td>
                            <td class="pr-col-actions">
                                <button class="btn btn-ghost btn-sm pr-edit-btn" data-id="${rule.id}" title="Editar">
                                    ✏️
                                </button>
                                <button class="btn btn-ghost btn-sm pr-delete-btn" data-id="${rule.id}" title="Eliminar">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                        <path d="M10 11v6"/><path d="M14 11v6"/>
                                    </svg>
                                </button>
                            </td>
                        </tr>`;
                }).join('')}
            </tbody>
        </table>`;

    // Botones editar
    list.querySelectorAll('.pr-edit-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            startEditRule(this.dataset.id);
        });
    });

    // Botones eliminar
    list.querySelectorAll('.pr-delete-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const id   = this.dataset.id;
            const rule = PricingRulesState.items.find(function (r) { return String(r.id) === String(id); });
            showConfirm({
                icon:    '💰',
                title:   '¿Eliminar regla de precio?',
                message: rule
                    ? `Se eliminará "${rule.name}" (${formatDate(rule.date_from)} → ${formatDate(rule.date_to)}).`
                    : 'Esta acción no se puede deshacer.',
                acceptText:  'Eliminar',
                acceptClass: 'btn-danger',
                onAccept: function () { deletePricingRule(id); }
            });
        });
    });
}

function startEditRule(id) {
    const rule = PricingRulesState.items.find(function (r) { return String(r.id) === String(id); });
    if (!rule) return;

    PricingRulesState.editingId = rule.id;

    document.getElementById('prName').value          = rule.name;
    document.getElementById('prDateFrom').value      = rule.date_from;
    document.getElementById('prDateTo').value        = rule.date_to;
    document.getElementById('prPricePerNight').value = rule.price_per_night;

    const title  = document.getElementById('prFormTitle');
    const submit = document.getElementById('prSubmitBtn');
    const cancel = document.getElementById('prCancelEdit');
    if (title)  title.textContent  = '✏️ Editar regla';
    if (submit) submit.textContent = 'Guardar cambios';
    if (cancel) cancel.hidden      = false;

    // Scroll al formulario
    document.getElementById('pricingRuleForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    renderPricingRulesList(); // resaltar fila en edición
}

function cancelEditRule() {
    PricingRulesState.editingId = null;

    document.getElementById('pricingRuleForm')?.reset();

    const title  = document.getElementById('prFormTitle');
    const submit = document.getElementById('prSubmitBtn');
    const cancel = document.getElementById('prCancelEdit');
    if (title)  title.textContent  = '➕ Nueva regla de precio';
    if (submit) submit.textContent = 'Añadir regla';
    if (cancel) cancel.hidden      = true;

    const errorEl = document.getElementById('prFormError');
    if (errorEl) errorEl.hidden = true;

    renderPricingRulesList();
}

async function handlePricingRuleSubmit(e) {
    e.preventDefault();

    const name     = document.getElementById('prName').value.trim();
    const dateFrom = document.getElementById('prDateFrom').value;
    const dateTo   = document.getElementById('prDateTo').value;
    const price    = document.getElementById('prPricePerNight').value;
    const submitBtn = document.getElementById('prSubmitBtn');
    const errorEl   = document.getElementById('prFormError');

    if (errorEl) errorEl.hidden = true;

    if (!name || !dateFrom || !dateTo || !price) {
        showPrError('Todos los campos son obligatorios.');
        return;
    }
    if (dateFrom > dateTo) {
        showPrError('La fecha de inicio debe ser anterior o igual a la fecha de fin.');
        return;
    }
    if (parseFloat(price) <= 0) {
        showPrError('El precio debe ser mayor que 0.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    const payload = { name, date_from: dateFrom, date_to: dateTo, price_per_night: parseFloat(price) };

    try {
        if (PricingRulesState.editingId) {
            const updated = await PricingRulesAPI.update(PricingRulesState.editingId, payload);
            PricingRulesState.items = PricingRulesState.items.map(function (r) {
                return String(r.id) === String(PricingRulesState.editingId) ? updated : r;
            });
            showToast('Regla de precio actualizada', 'success');
        } else {
            const created = await PricingRulesAPI.create(payload);
            PricingRulesState.items.push(created);
            PricingRulesState.items.sort(function (a, b) {
                return a.date_from.localeCompare(b.date_from);
            });
            showToast('Regla de precio añadida', 'success');
        }

        cancelEditRule(); // resetea formulario y estado
        renderPricingRulesList();

    } catch (err) {
        showPrError(err.message || 'No se pudo guardar la regla.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = PricingRulesState.editingId ? 'Guardar cambios' : 'Añadir regla';
    }
}

async function deletePricingRule(id) {
    try {
        await PricingRulesAPI.remove(id);
        PricingRulesState.items = PricingRulesState.items.filter(function (r) {
            return String(r.id) !== String(id);
        });
        if (String(PricingRulesState.editingId) === String(id)) cancelEditRule();
        renderPricingRulesList();
        showToast('Regla eliminada', 'success');
    } catch (err) {
        showToast('Error al eliminar: ' + err.message, 'error');
    }
}

function showPrError(msg) {
    const el    = document.getElementById('prFormError');
    const msgEl = document.getElementById('prFormErrorMsg');
    if (el && msgEl) {
        msgEl.textContent = msg;
        el.hidden = false;
    }
}
