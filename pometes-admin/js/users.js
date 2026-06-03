/* =========================================================
   USERS.JS — Gestión de administradores
   La Llar de Pometes · Panel de Administración
   ========================================================= */

'use strict';

// ── Estado ──
const UsersState = { list: [], initialized: false };

// ── Init (llamado desde navigateTo en dashboard.js) ──
function initUsersSection() {
    if (UsersState.initialized) {
        renderUsersList();
        return;
    }
    UsersState.initialized = true;

    const form = document.getElementById('addUserForm');
    if (form) form.addEventListener('submit', handleAddUser);

    loadUsers();
}

// ── Carga ──
async function loadUsers() {
    const container = document.getElementById('usersList');
    if (!container) return;
    container.innerHTML = '<div style="padding:20px 24px;color:var(--text-light)">Cargando...</div>';

    try {
        UsersState.list = await UsersAPI.getAll();
        renderUsersList();
    } catch (err) {
        container.innerHTML = `<p style="padding:20px 24px;color:var(--danger)">Error: ${escapeHtml(err.message)}</p>`;
    }
}

// ── Render lista ──
function renderUsersList() {
    const container = document.getElementById('usersList');
    if (!container) return;

    const currentUserId = getCurrentUserId();

    if (UsersState.list.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><p>No hay administradores.</p></div>';
        return;
    }

    const rows = UsersState.list.map(function (u) {
        const initials   = getInitials(u.name);
        const isSelf     = u.id === currentUserId;
        const lastLogin  = u.last_login ? formatDate(u.last_login.split('T')[0]) : 'Nunca';

        return `<tr>
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:34px;height:34px;border-radius:50%;background:var(--teal);color:#fff;
                                display:flex;align-items:center;justify-content:center;
                                font-size:12px;font-weight:700;flex-shrink:0">
                        ${escapeHtml(initials)}
                    </div>
                    <div>
                        <div style="font-weight:600;display:flex;align-items:center;gap:6px">
                            ${escapeHtml(u.name)}
                            ${isSelf ? '<span style="background:rgba(44,95,122,0.1);color:var(--teal);font-size:10px;font-weight:600;padding:2px 7px;border-radius:20px">Tú</span>' : ''}
                        </div>
                        <div style="font-size:12px;color:var(--text-light)">${escapeHtml(u.email)}</div>
                    </div>
                </div>
            </td>
            <td style="font-size:13px;color:var(--text-light)">${lastLogin}</td>
            <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                    <button class="btn btn-ghost btn-sm" onclick="openUserEditModal(${u.id})">Editar</button>
                    <button class="btn btn-ghost btn-sm" onclick="openUserPasswordModal(${u.id}, '${escapeHtml(u.name).replace(/'/g, "\\'")}')">Contraseña</button>
                    ${!isSelf ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id}, '${escapeHtml(u.name).replace(/'/g, "\\'")}')">Eliminar</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="table-wrapper">
            <table class="bookings-table">
                <thead>
                    <tr>
                        <th>Administrador</th>
                        <th>Último acceso</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

// ── Añadir usuario ──
async function handleAddUser(e) {
    e.preventDefault();
    const name     = document.getElementById('newUserName').value.trim();
    const email    = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const btn      = document.getElementById('addUserBtn');
    const errEl    = document.getElementById('addUserError');
    const errMsg   = document.getElementById('addUserErrorMsg');

    errEl.hidden  = true;
    btn.disabled  = true;
    btn.textContent = 'Añadiendo...';

    try {
        const user = await UsersAPI.create({ name, email, password });
        UsersState.list.push(user);
        renderUsersList();
        e.target.reset();
        showToast('Administrador añadido correctamente', 'success');
    } catch (err) {
        errMsg.textContent = err.message;
        errEl.hidden = false;
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Añadir administrador';
    }
}

// ── Editar usuario ──
function openUserEditModal(id) {
    const u = UsersState.list.find(function (u) { return u.id === id; });
    if (!u) return;

    openFormModal('Editar administrador', `
        <div class="form-group">
            <label for="editUserName">Nombre</label>
            <input type="text" id="editUserName" value="${escapeHtml(u.name)}" required>
        </div>
        <div class="form-group">
            <label for="editUserEmail">Email</label>
            <input type="email" id="editUserEmail" value="${escapeHtml(u.email)}" required>
        </div>`,
        async function () {
            const name  = document.getElementById('editUserName').value.trim();
            const email = document.getElementById('editUserEmail').value.trim();
            await UsersAPI.update(id, { name, email });

            const idx = UsersState.list.findIndex(function (u) { return u.id === id; });
            if (idx !== -1) {
                UsersState.list[idx].name  = name;
                UsersState.list[idx].email = email;
            }

            renderUsersList();
            showToast('Usuario actualizado', 'success');

            // Actualizar nombre en sidebar si es el propio usuario
            if (id === getCurrentUserId()) {
                localStorage.setItem('pometes_user_name', name);
                refreshSidebarUser();
            }
        }
    );
}

// ── Cambiar contraseña ──
function openUserPasswordModal(id, name) {
    openFormModal('Cambiar contraseña — ' + name, `
        <div class="form-group">
            <label for="newPassInput">Nueva contraseña</label>
            <input type="password" id="newPassInput" placeholder="Mín. 8 caracteres" minlength="8" required>
        </div>
        <div class="form-group">
            <label for="newPassConfirm">Confirmar contraseña</label>
            <input type="password" id="newPassConfirm" placeholder="Repite la contraseña" required>
        </div>`,
        async function () {
            const pass    = document.getElementById('newPassInput').value;
            const confirm = document.getElementById('newPassConfirm').value;
            if (pass !== confirm) throw new Error('Las contraseñas no coinciden');
            await UsersAPI.changePassword(id, pass);
            showToast('Contraseña actualizada correctamente', 'success');
        }
    );
}

// ── Eliminar usuario ──
function deleteUser(id, name) {
    showConfirm({
        icon:        '⚠️',
        title:       '¿Eliminar administrador?',
        message:     '¿Seguro que quieres eliminar a "' + name + '"? Esta acción es permanente.',
        acceptText:  'Eliminar',
        acceptClass: 'btn-danger',
        onAccept: async function () {
            try {
                await UsersAPI.remove(id);
                UsersState.list = UsersState.list.filter(function (u) { return u.id !== id; });
                renderUsersList();
                showToast(name + ' eliminado', 'success');
            } catch (err) {
                showToast(err.message, 'error');
            }
        }
    });
}

// ── Modal de formulario genérico ──
function openFormModal(title, fieldsHtml, onSubmit) {
    var existing = document.getElementById('userFormModal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'userFormModal';
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.45)',
        'display:flex', 'align-items:center', 'justify-content:center',
        'z-index:1000', 'padding:20px'
    ].join(';');

    overlay.innerHTML = `
        <div style="background:var(--white);border-radius:var(--radius-lg);
                    box-shadow:0 20px 60px rgba(0,0,0,0.2);
                    width:100%;max-width:440px;padding:28px">
            <h3 style="margin:0 0 20px;font-size:17px;font-weight:700;color:var(--text)">
                ${escapeHtml(title)}
            </h3>
            <form id="userModalForm" class="settings-form" style="margin:0">
                ${fieldsHtml}
                <div id="userModalError" class="login-error" hidden style="margin-bottom:12px">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span id="userModalErrorMsg"></span>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
                    <button type="button" class="btn btn-ghost" id="userModalCancel">Cancelar</button>
                    <button type="submit" class="btn btn-primary" id="userModalSubmit">Guardar</button>
                </div>
            </form>
        </div>`;

    document.body.appendChild(overlay);

    function close() { overlay.remove(); }

    overlay.querySelector('#userModalCancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } }
    document.addEventListener('keydown', onEsc);

    overlay.querySelector('#userModalForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        var errEl  = document.getElementById('userModalError');
        var errMsg = document.getElementById('userModalErrorMsg');
        var btn    = document.getElementById('userModalSubmit');
        errEl.hidden   = true;
        btn.disabled   = true;
        btn.textContent = 'Guardando...';
        try {
            await onSubmit();
            close();
        } catch (err) {
            errMsg.textContent = err.message;
            errEl.hidden = false;
            btn.disabled    = false;
            btn.textContent = 'Guardar';
        }
    });

    setTimeout(function () {
        var first = overlay.querySelector('input');
        if (first) first.focus();
    }, 50);
}

// ── Helpers ──
function getCurrentUserId() {
    var token = getToken();
    if (!token) return null;
    try { return JSON.parse(atob(token.split('.')[1])).userId; } catch { return null; }
}

function refreshSidebarUser() {
    var name = localStorage.getItem('pometes_user_name') || 'Admin';
    var nameEl = document.getElementById('sidebarUserName');
    if (nameEl) nameEl.textContent = name;

    var initialsEl = document.getElementById('sidebarUserInitials');
    if (initialsEl) initialsEl.textContent = getInitials(name);
}

// Inicializar info de usuario en sidebar al cargar la página
refreshSidebarUser();
