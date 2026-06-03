/* =========================================================
   AUTH.JS — Gestión de autenticación JWT
   La Llar de Pometes · Panel de Administración
   ========================================================= */

'use strict';

// ── Constantes ──
const AUTH_TOKEN_KEY  = 'pometes_admin_token';
const LOGIN_PAGE      = 'index.html';
const DASHBOARD_PAGE  = 'dashboard.html';
const API_BASE_AUTH   = 'https://lallardepometes.es/api';

// ── Gestión del token ──

/** Devuelve el JWT almacenado o null si no existe */
function getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

/** Guarda el JWT en localStorage */
function setToken(token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
}

/** Elimina el token y redirige al login */
function logout() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    window.location.replace(LOGIN_PAGE);
}

/** Indica si hay una sesión activa */
function isAuthenticated() {
    return Boolean(getToken());
}

/**
 * Protege páginas del dashboard.
 * Si no hay sesión → redirige al login.
 */
function requireAuth() {
    if (!isAuthenticated()) {
        window.location.replace(LOGIN_PAGE);
    }
}

/**
 * Para la página de login: si ya hay sesión activa → ir al dashboard.
 */
function redirectIfAuthenticated() {
    if (isAuthenticated()) {
        window.location.replace(DASHBOARD_PAGE);
    }
}

// ── Lógica específica de la página de login ──

(function initLoginPage() {
    // Solo ejecutar si estamos en la página de login
    const form = document.getElementById('loginForm');
    if (!form) return;

    // Redirigir si ya está autenticado
    redirectIfAuthenticated();

    const passwordInput = document.getElementById('password');
    const btnLogin      = document.getElementById('btnLogin');
    const btnText       = btnLogin.querySelector('.btn-text');
    const btnSpinner    = document.getElementById('btnSpinner');
    const loginError    = document.getElementById('loginError');
    const loginErrorMsg = document.getElementById('loginErrorMsg');
    const toggleBtn     = document.getElementById('togglePassword');

    // Toggle visibilidad de la contraseña
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';

            // Intercambiar los iconos
            this.querySelector('.eye-open').style.display   = isPassword ? 'none'  : '';
            this.querySelector('.eye-closed').style.display = isPassword ? ''      : 'none';
        });
    }

    // Submit del formulario
    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const password = passwordInput.value.trim();
        if (!password) {
            passwordInput.focus();
            return;
        }

        setLoginLoading(true);
        hideError();

        try {
            const response = await fetch(`${API_BASE_AUTH}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || data.message || 'Contraseña incorrecta. Inténtalo de nuevo.');
            }

            if (!data.token) {
                throw new Error('Respuesta de la API no válida.');
            }

            // Guardar último acceso
            localStorage.setItem('pometes_last_access', new Date().toISOString());

            setToken(data.token);
            window.location.replace(DASHBOARD_PAGE);

        } catch (error) {
            showError(error.message);
            passwordInput.select();
        } finally {
            setLoginLoading(false);
        }
    });

    /** Activa/desactiva el estado de carga del botón */
    function setLoginLoading(loading) {
        btnLogin.disabled  = loading;
        btnText.hidden     = loading;
        btnSpinner.hidden  = !loading;
    }

    /** Muestra el mensaje de error */
    function showError(msg) {
        loginErrorMsg.textContent = msg;
        loginError.hidden = false;
    }

    /** Oculta el mensaje de error */
    function hideError() {
        loginError.hidden = true;
    }

    // Ocultar error cuando el usuario empieza a escribir de nuevo
    passwordInput.addEventListener('input', hideError);

})();
