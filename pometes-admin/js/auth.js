/* =========================================================
   AUTH.JS — Gestión de autenticación JWT
   La Llar de Pometes · Panel de Administración
   ========================================================= */

'use strict';

const AUTH_TOKEN_KEY = 'pometes_admin_token';
const AUTH_NAME_KEY  = 'pometes_user_name';
const LOGIN_PAGE     = 'index.html';
const DASHBOARD_PAGE = 'dashboard.html';
const API_BASE_AUTH  = 'https://lallardepometes.es/api';

// ── Token ──

function getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

function setToken(token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function logout() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_NAME_KEY);
    window.location.replace(LOGIN_PAGE);
}

function isAuthenticated() {
    return Boolean(getToken());
}

function requireAuth() {
    if (!isAuthenticated()) {
        window.location.replace(LOGIN_PAGE);
    }
}

function redirectIfAuthenticated() {
    if (isAuthenticated()) {
        window.location.replace(DASHBOARD_PAGE);
    }
}

// Decodifica el payload JWT (sin verificar firma — solo para uso en cliente)
function parseJwt(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch {
        return null;
    }
}

// Devuelve el nombre guardado o lo extrae del token
function getUserName() {
    return localStorage.getItem(AUTH_NAME_KEY) || 'Admin';
}

// ── Página de login ──

(function initLoginPage() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    redirectIfAuthenticated();

    const emailInput    = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const btnLogin      = document.getElementById('btnLogin');
    const btnText       = btnLogin.querySelector('.btn-text');
    const btnSpinner    = document.getElementById('btnSpinner');
    const loginError    = document.getElementById('loginError');
    const loginErrorMsg = document.getElementById('loginErrorMsg');
    const toggleBtn     = document.getElementById('togglePassword');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            this.querySelector('.eye-open').style.display   = isPassword ? 'none' : '';
            this.querySelector('.eye-closed').style.display = isPassword ? ''     : 'none';
        });
    }

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const email    = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            emailInput.focus();
            return;
        }

        setLoginLoading(true);
        hideError();

        try {
            const response = await fetch(`${API_BASE_AUTH}/auth/login`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ email, password })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || data.message || 'Credenciales incorrectas. Inténtalo de nuevo.');
            }

            if (!data.token) {
                throw new Error('Respuesta de la API no válida.');
            }

            localStorage.setItem('pometes_last_access', new Date().toISOString());
            localStorage.setItem(AUTH_NAME_KEY, data.name || 'Admin');

            setToken(data.token);
            window.location.replace(DASHBOARD_PAGE);

        } catch (error) {
            showError(error.message);
            passwordInput.select();
        } finally {
            setLoginLoading(false);
        }
    });

    function setLoginLoading(loading) {
        btnLogin.disabled = loading;
        btnText.hidden    = loading;
        btnSpinner.hidden = !loading;
    }

    function showError(msg) {
        loginErrorMsg.textContent = msg;
        loginError.hidden = false;
    }

    function hideError() {
        loginError.hidden = true;
    }

    emailInput.addEventListener('input', hideError);
    passwordInput.addEventListener('input', hideError);
})();
