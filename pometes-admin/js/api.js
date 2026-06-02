/* =========================================================
   API.JS — Wrapper fetch con JWT y manejo de errores
   Casa Rural Pometes · Panel de Administración
   ========================================================= */

'use strict';

/** URL base de la API REST */
const API_BASE = 'https://casaruralpometes.es/api';

/**
 * Realiza una petición autenticada a la API.
 *
 * @param {string} endpoint   - Ruta relativa, p.ej. '/bookings' o '/bookings/5/status'
 * @param {object} [options]  - Opciones fetch (method, body, signal…)
 * @returns {Promise<any>}    - Datos JSON de la respuesta
 * @throws {Error}            - Con propiedad `status` cuando la API devuelve un error
 */
async function apiFetch(endpoint, options = {}) {
    const token  = getToken();
    const method = options.method || 'GET';

    console.log(`[api] ${method} ${API_BASE}${endpoint}`);

    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    // Añadir Authorization si hay token
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    } else {
        console.warn('[api] No hay token — la petición se enviará sin Authorization');
    }

    let response;
    try {
        response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });
    } catch (networkError) {
        // Error de red (sin conexión, CORS, timeout…)
        console.error('[api] Error de red:', networkError);
        const err = new Error('No se pudo conectar con la API. Verifica tu conexión.');
        err.status = 0;
        err.networkError = true;
        throw err;
    }

    console.log(`[api] Respuesta ${response.status} para ${method} ${endpoint}`);

    // Token expirado o no válido → cierre de sesión automático
    if (response.status === 401) {
        console.warn('[api] 401 recibido — cerrando sesión');
        logout();
        return;
    }

    // Intentar parsear la respuesta como JSON
    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        data = await response.json().catch(() => ({}));
    } else {
        data = {};
    }

    if (!response.ok) {
        const err = new Error(data.error || data.message || `Error ${response.status}`);
        err.status = response.status;
        err.data   = data;
        throw err;
    }

    return data;
}

// ── Métodos de conveniencia ──

/** GET autenticado */
function apiGet(endpoint) {
    return apiFetch(endpoint, { method: 'GET' });
}

/** POST autenticado con body JSON */
function apiPost(endpoint, body) {
    return apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
    });
}

/** PUT autenticado con body JSON */
function apiPut(endpoint, body) {
    return apiFetch(endpoint, {
        method: 'PUT',
        body: JSON.stringify(body)
    });
}

/** DELETE autenticado */
function apiDelete(endpoint) {
    return apiFetch(endpoint, { method: 'DELETE' });
}

// ── Endpoints específicos ──

const BookingsAPI = {
    /** Lista todas las reservas (opcionalmente filtradas) */
    getAll(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return apiGet(`/bookings${qs ? '?' + qs : ''}`);
    },

    /** Obtiene el detalle de una reserva */
    getById(id) {
        return apiGet(`/bookings/${id}`);
    },

    /** Cambia el estado de una reserva */
    updateStatus(id, status) {
        return apiPut(`/bookings/${id}/status`, { status });
    }
};

const CalendarAPI = {
    /** Devuelve las fechas ocupadas de un mes */
    getAvailability(year, month) {
        return apiGet(`/availability?year=${year}&month=${month}`);
    }
};

const AuthAPI = {
    /** Cambia la contraseña del administrador */
    changePassword(currentPassword, newPassword) {
        return apiPost('/auth/change-password', { currentPassword, newPassword });
    },

    /** Verifica que la API está disponible */
    ping() {
        return apiGet('/health').catch(() => null);
    }
};
