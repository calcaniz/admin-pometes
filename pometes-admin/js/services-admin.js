/* =========================================================
   SERVICES-ADMIN.JS — Gestión del catálogo de servicios extra
   La Llar de Pometes · Panel de Administración
   ========================================================= */
'use strict';

const ServicesAdminState = { items: [], editingId: null, initialized: false };

function initServicesSection() {
    if (ServicesAdminState.initialized) { renderServicesList(); return; }
    ServicesAdminState.initialized = true;

    document.getElementById('serviceForm')?.addEventListener('submit', handleServiceSubmit);
    document.getElementById('svcCancelEdit')?.addEventListener('click', cancelEditService);

    // Toggle deposit en settings
    document.getElementById('depositSettingForm')?.addEventListener('submit', handleDepositSettingSubmit);

    loadServices();
    loadDepositSetting();
}

async function loadServices() {
    try {
        const data = await apiFetch('/services');
        ServicesAdminState.items = Array.isArray(data) ? data : [];
        renderServicesList();
    } catch (err) {
        showToast('No se pudieron cargar los servicios: ' + err.message, 'error');
    }
}

function renderServicesList() {
    const el = document.getElementById('servicesAdminList');
    if (!el) return;

    if (ServicesAdminState.items.length === 0) {
        el.innerHTML = '<div class="svc-empty"><div style="font-size:32px;margin-bottom:8px">🛎️</div><p>No hay servicios configurados. Añade el primero.</p></div>';
        return;
    }

    el.innerHTML = `
        <table class="pr-table">
            <thead>
                <tr>
                    <th>Icono</th><th>Nombre</th><th>Descripción</th>
                    <th>Precio</th><th>Obligatorio</th><th>Activo</th><th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${ServicesAdminState.items.map(function (s) {
                    const editingClass = String(ServicesAdminState.editingId) === String(s.id) ? 'pr-row--editing' : '';
                    return `
                        <tr class="${editingClass}">
                            <td style="font-size:22px;text-align:center">${s.icon || '🛎️'}</td>
                            <td class="pr-col-name">${escapeHtml(s.name)}</td>
                            <td style="font-size:13px;color:var(--text-mid)">${escapeHtml(s.description || '—')}</td>
                            <td class="pr-col-price">${parseFloat(s.price) > 0 ? formatCurrency(s.price) : 'Gratis'}</td>
                            <td style="text-align:center">${s.mandatory ? '<span class="bd-status bd-status-active">Sí</span>' : '—'}</td>
                            <td style="text-align:center">${s.active ? '✅' : '❌'}</td>
                            <td class="pr-col-actions">
                                <button class="btn btn-ghost btn-sm svc-edit-btn" data-id="${s.id}" title="Editar">✏️</button>
                                <button class="btn btn-ghost btn-sm svc-toggle-btn" data-id="${s.id}" data-active="${s.active}" title="${s.active ? 'Desactivar' : 'Activar'}">
                                    ${s.active ? '🔕' : '🔔'}
                                </button>
                            </td>
                        </tr>`;
                }).join('')}
            </tbody>
        </table>`;

    el.querySelectorAll('.svc-edit-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { startEditService(this.dataset.id); });
    });
    el.querySelectorAll('.svc-toggle-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { toggleServiceActive(this.dataset.id, this.dataset.active === '1' || this.dataset.active === 'true'); });
    });
}

function startEditService(id) {
    const s = ServicesAdminState.items.find(function (sv) { return String(sv.id) === String(id); });
    if (!s) return;
    ServicesAdminState.editingId = s.id;
    document.getElementById('svcName').value        = s.name;
    document.getElementById('svcDescription').value = s.description || '';
    document.getElementById('svcPrice').value       = s.price;
    document.getElementById('svcIcon').value        = s.icon || '🛎️';
    document.getElementById('svcMandatory').checked = !!s.mandatory;
    document.getElementById('svcFormTitle').textContent  = '✏️ Editar servicio';
    document.getElementById('svcSubmitBtn').textContent  = 'Guardar cambios';
    document.getElementById('svcCancelEdit').hidden      = false;
    document.getElementById('serviceForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    renderServicesList();
}

function cancelEditService() {
    ServicesAdminState.editingId = null;
    document.getElementById('serviceForm')?.reset();
    document.getElementById('svcFormTitle').textContent  = '➕ Añadir servicio';
    document.getElementById('svcSubmitBtn').textContent  = 'Añadir servicio';
    document.getElementById('svcCancelEdit').hidden      = true;
    document.getElementById('svcFormError')?.setAttribute('hidden', '');
    renderServicesList();
}

async function handleServiceSubmit(e) {
    e.preventDefault();
    const payload = {
        name:        document.getElementById('svcName').value.trim(),
        description: document.getElementById('svcDescription').value.trim() || undefined,
        price:       parseFloat(document.getElementById('svcPrice').value) || 0,
        icon:        document.getElementById('svcIcon').value.trim() || '🛎️',
        mandatory:   document.getElementById('svcMandatory').checked,
        active:      true
    };
    const btn    = document.getElementById('svcSubmitBtn');
    const errEl  = document.getElementById('svcFormError');
    const msgEl  = document.getElementById('svcFormErrorMsg');
    if (errEl) errEl.hidden = true;
    if (!payload.name) { if (errEl && msgEl) { msgEl.textContent = 'El nombre es obligatorio.'; errEl.hidden = false; } return; }

    btn.disabled = true; btn.textContent = 'Guardando...';
    try {
        if (ServicesAdminState.editingId) {
            const updated = await apiFetch(`/services/${ServicesAdminState.editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
            ServicesAdminState.items = ServicesAdminState.items.map(function (sv) {
                return String(sv.id) === String(ServicesAdminState.editingId) ? updated : sv;
            });
            showToast('Servicio actualizado', 'success');
        } else {
            const created = await apiFetch('/services', { method: 'POST', body: JSON.stringify(payload) });
            ServicesAdminState.items.push(created);
            showToast('Servicio añadido', 'success');
        }
        cancelEditService();
        renderServicesList();
    } catch (err) {
        if (errEl && msgEl) { msgEl.textContent = err.message || 'Error al guardar.'; errEl.hidden = false; }
    } finally {
        btn.disabled = false;
        btn.textContent = ServicesAdminState.editingId ? 'Guardar cambios' : 'Añadir servicio';
    }
}

async function toggleServiceActive(id, currentlyActive) {
    const s = ServicesAdminState.items.find(function (sv) { return String(sv.id) === String(id); });
    if (!s) return;
    try {
        await apiFetch(`/services/${id}`, { method: 'PUT', body: JSON.stringify({ ...s, active: !currentlyActive }) });
        s.active = !currentlyActive;
        renderServicesList();
        showToast(`Servicio ${s.active ? 'activado' : 'desactivado'}`, 'success');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// Configuración de la fianza
async function loadDepositSetting() {
    try {
        const settings = await SettingsAPI.getAll();
        const input = document.getElementById('depositAmountInput');
        if (input && settings.deposit_amount) input.value = settings.deposit_amount;
    } catch {}
}

async function handleDepositSettingSubmit(e) {
    e.preventDefault();
    const val = parseFloat(document.getElementById('depositAmountInput').value);
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';
    try {
        await SettingsAPI.update('deposit_amount', isNaN(val) ? 0 : val);
        showToast(`Fianza configurada a ${isNaN(val) ? 0 : val}€`, 'success');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Guardar';
    }
}
