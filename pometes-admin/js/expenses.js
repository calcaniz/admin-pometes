/* =========================================================
   EXPENSES.JS — Control de gastos de la casa
   La Llar de Pometes · Panel de Administración
   ========================================================= */

'use strict';

const EXP_CATEGORIES = {
    reformas:         { label: 'Reformas',          icon: '🔨' },
    mantenimiento:    { label: 'Mantenimiento',      icon: '🔧' },
    electrodomesticos:{ label: 'Electrodomésticos',  icon: '📺' },
    mobiliario:       { label: 'Mobiliario',         icon: '🪑' },
    limpieza:         { label: 'Limpieza',           icon: '🧹' },
    seguros:          { label: 'Seguros',            icon: '📋' },
    otros:            { label: 'Otros',              icon: '📦' }
};

// ── Estado ──
const ExpState = {
    all:         [],    // todos los gastos cargados
    editingId:   null,  // id del gasto en edición
    filterCat:   '',
    filterYear:  '',
    initialized: false
};

// ── Init ──
function initExpensesSection() {
    if (ExpState.initialized) {
        renderExpenses();
        return;
    }
    ExpState.initialized = true;

    // Filtro categoría
    document.getElementById('expCategoryFilter').addEventListener('click', function (e) {
        var btn = e.target.closest('.filter-tab');
        if (!btn) return;
        this.querySelectorAll('.filter-tab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        ExpState.filterCat = btn.dataset.value;
        renderExpenses();
    });

    // Filtro año
    document.getElementById('expYearFilter').addEventListener('change', function () {
        ExpState.filterYear = this.value;
        renderExpenses();
    });

    // Formulario
    document.getElementById('expenseForm').addEventListener('submit', handleExpenseSubmit);

    // Botón cancelar edición
    document.getElementById('expCancelEdit').addEventListener('click', cancelEdit);

    // Fecha por defecto: hoy
    document.getElementById('expDate').value = new Date().toISOString().split('T')[0];

    loadExpenses();
}

// ── Carga ──
async function loadExpenses() {
    try {
        ExpState.all = await ExpensesAPI.getAll();
        populateYearFilter();
        renderMetrics();
        renderExpenses();
    } catch (err) {
        showToast('No se pudieron cargar los gastos: ' + err.message, 'error');
    }
}

// ── Filtrado ──
function getFiltered() {
    return ExpState.all.filter(function (e) {
        var catOk  = !ExpState.filterCat  || e.category === ExpState.filterCat;
        var yearOk = !ExpState.filterYear || e.date.startsWith(ExpState.filterYear);
        return catOk && yearOk;
    });
}

// ── Selector de años ──
function populateYearFilter() {
    var years = [...new Set(ExpState.all.map(function (e) { return e.date.slice(0, 4); }))].sort().reverse();
    var sel   = document.getElementById('expYearFilter');
    sel.innerHTML = '<option value="">Todos los años</option>';
    years.forEach(function (y) {
        var opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        sel.appendChild(opt);
    });
}

// ── Métricas ──
function renderMetrics() {
    var thisYear  = String(new Date().getFullYear());
    var total     = ExpState.all.reduce(function (s, e) { return s + parseFloat(e.amount); }, 0);
    var yearTotal = ExpState.all
        .filter(function (e) { return e.date.startsWith(thisYear); })
        .reduce(function (s, e) { return s + parseFloat(e.amount); }, 0);

    // Categoría con más gasto total
    var byCat = {};
    ExpState.all.forEach(function (e) {
        byCat[e.category] = (byCat[e.category] || 0) + parseFloat(e.amount);
    });
    var topCat = Object.entries(byCat).sort(function (a, b) { return b[1] - a[1]; })[0];

    document.getElementById('expMetricTotal').textContent = formatCurrency(total);
    document.getElementById('expMetricYear').textContent  = formatCurrency(yearTotal);
    document.getElementById('expMetricTopCat').textContent = topCat
        ? (EXP_CATEGORIES[topCat[0]]?.icon || '') + ' ' + (EXP_CATEGORIES[topCat[0]]?.label || topCat[0])
        : '—';
}

// ── Renderizado de tabla ──
function renderExpenses() {
    var filtered = getFiltered();
    var tbody    = document.getElementById('expTableBody');
    var empty    = document.getElementById('expEmptyState');
    var info     = document.getElementById('expResultsInfo');

    var totalFiltered = filtered.reduce(function (s, e) { return s + parseFloat(e.amount); }, 0);
    info.textContent = filtered.length + ' gasto' + (filtered.length !== 1 ? 's' : '') +
        ' · Total: ' + formatCurrency(totalFiltered);

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        empty.hidden = false;
        return;
    }
    empty.hidden = true;

    tbody.innerHTML = filtered.map(function (e) {
        var cat  = EXP_CATEGORIES[e.category] || { label: e.category, icon: '📦' };
        var isEditing = e.id === ExpState.editingId;

        return `<tr${isEditing ? ' style="background:rgba(44,95,122,0.04)"' : ''}>
            <td style="white-space:nowrap;font-size:13px">${formatDate(e.date)}</td>
            <td>
                <span style="background:var(--sand);padding:3px 10px;border-radius:20px;
                             font-size:12px;font-weight:500;white-space:nowrap">
                    ${cat.icon} ${cat.label}
                </span>
            </td>
            <td>
                <div style="font-weight:500">${escapeHtml(e.description)}</div>
                ${e.notes ? `<div style="font-size:12px;color:var(--text-light)">${escapeHtml(e.notes)}</div>` : ''}
            </td>
            <td style="font-size:13px;color:var(--text-mid)">${escapeHtml(e.provider || '—')}</td>
            <td style="text-align:right;font-weight:700;white-space:nowrap;color:var(--text)">
                ${formatCurrency(e.amount)}
            </td>
            <td>
                <div style="display:flex;gap:6px">
                    <button class="btn btn-ghost btn-sm" onclick="startEditExpense(${e.id})">Editar</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteExpense(${e.id}, '${escapeHtml(e.description).replace(/'/g, "\\'")}')">Eliminar</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ── Añadir / Guardar gasto ──
async function handleExpenseSubmit(e) {
    e.preventDefault();

    var data = {
        date:        document.getElementById('expDate').value,
        category:    document.getElementById('expCategory').value,
        description: document.getElementById('expDescription').value.trim(),
        amount:      parseFloat(document.getElementById('expAmount').value),
        provider:    document.getElementById('expProvider').value.trim() || null,
        notes:       document.getElementById('expNotes').value.trim() || null
    };

    var btn    = document.getElementById('expSubmitBtn');
    var errEl  = document.getElementById('expFormError');
    var errMsg = document.getElementById('expFormErrorMsg');

    errEl.hidden  = true;
    btn.disabled  = true;
    btn.textContent = ExpState.editingId ? 'Guardando...' : 'Añadiendo...';

    try {
        if (ExpState.editingId) {
            await ExpensesAPI.update(ExpState.editingId, data);
            var idx = ExpState.all.findIndex(function (e) { return e.id === ExpState.editingId; });
            if (idx !== -1) ExpState.all[idx] = Object.assign({}, ExpState.all[idx], data);
            showToast('Gasto actualizado correctamente', 'success');
            cancelEdit();
        } else {
            var created = await ExpensesAPI.create(data);
            ExpState.all.unshift(created);
            e.target.reset();
            document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
            showToast('Gasto añadido correctamente', 'success');
        }

        populateYearFilter();
        renderMetrics();
        renderExpenses();

    } catch (err) {
        errMsg.textContent = err.message;
        errEl.hidden = false;
    } finally {
        btn.disabled = false;
        btn.textContent = ExpState.editingId ? 'Guardar cambios' : 'Añadir gasto';
    }
}

// ── Edición ──
function startEditExpense(id) {
    var expense = ExpState.all.find(function (e) { return e.id === id; });
    if (!expense) return;

    ExpState.editingId = id;

    document.getElementById('expDate').value        = expense.date;
    document.getElementById('expCategory').value    = expense.category;
    document.getElementById('expDescription').value = expense.description;
    document.getElementById('expAmount').value      = expense.amount;
    document.getElementById('expProvider').value    = expense.provider || '';
    document.getElementById('expNotes').value       = expense.notes || '';

    document.getElementById('expFormTitle').textContent = '✏️ Editar gasto';
    document.getElementById('expSubmitBtn').textContent = 'Guardar cambios';
    document.getElementById('expCancelEdit').hidden = false;

    // Scroll al formulario
    document.getElementById('expenseForm').scrollIntoView({ behavior: 'smooth', block: 'center' });

    renderExpenses(); // resaltar fila editada
}

function cancelEdit() {
    ExpState.editingId = null;
    document.getElementById('expenseForm').reset();
    document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('expFormTitle').textContent = '➕ Añadir gasto';
    document.getElementById('expSubmitBtn').textContent = 'Añadir gasto';
    document.getElementById('expCancelEdit').hidden = true;
    document.getElementById('expFormError').hidden  = true;
    renderExpenses();
}

// ── Eliminar ──
function deleteExpense(id, description) {
    showConfirm({
        icon:        '🗑️',
        title:       '¿Eliminar gasto?',
        message:     '¿Seguro que quieres eliminar "' + description + '"? Esta acción no se puede deshacer.',
        acceptText:  'Eliminar',
        acceptClass: 'btn-danger',
        onAccept: async function () {
            try {
                await ExpensesAPI.remove(id);
                ExpState.all = ExpState.all.filter(function (e) { return e.id !== id; });
                if (ExpState.editingId === id) cancelEdit();
                populateYearFilter();
                renderMetrics();
                renderExpenses();
                showToast('Gasto eliminado', 'success');
            } catch (err) {
                showToast(err.message, 'error');
            }
        }
    });
}
