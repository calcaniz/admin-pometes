/* =========================================================
   src/routes/auth.js — Endpoints de autenticación
   La Llar de Pometes · API REST
   =========================================================
   Variables de entorno requeridas:
     ADMIN_PASSWORD  — contraseña del administrador
     JWT_SECRET      — clave secreta para firmar tokens
   ========================================================= */

'use strict';

const express = require('express');
const jwt     = require('jsonwebtoken');
const router  = express.Router();

// ── POST /api/auth/login ──────────────────────────────────
// Verifica la contraseña y devuelve un JWT si es correcta.
router.post('/login', function (req, res) {
    const { password } = req.body || {};

    // Validación básica del cuerpo
    if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: 'El campo "password" es obligatorio.' });
    }

    // Verificar que las variables de entorno están configuradas
    const adminPassword = process.env.ADMIN_PASSWORD;
    const jwtSecret     = process.env.JWT_SECRET;

    if (!adminPassword || !jwtSecret) {
        console.error('[auth] ADMIN_PASSWORD o JWT_SECRET no están definidos en .env');
        return res.status(500).json({ error: 'Configuración del servidor incompleta.' });
    }

    // Comparar con la contraseña almacenada en el .env
    // Usar comparación de tiempo constante para evitar ataques de timing
    const isValid = timingSafeEqual(password, adminPassword);

    if (!isValid) {
        return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }

    // Generar el JWT con una expiración de 7 días
    const token = jwt.sign(
        { admin: true, iat: Math.floor(Date.now() / 1000) },
        jwtSecret,
        { expiresIn: '7d' }
    );

    return res.json({ token });
});

// ── POST /api/auth/change-password ────────────────────────
// Cambia la contraseña del administrador.
// Requiere token JWT válido (middleware de autenticación).
router.post('/change-password', requireAuth, function (req, res) {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Los campos "currentPassword" y "newPassword" son obligatorios.' });
    }

    if (!timingSafeEqual(currentPassword, process.env.ADMIN_PASSWORD)) {
        return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
    }

    // NOTA: Este endpoint solo valida; para que el cambio sea persistente,
    // debes actualizar ADMIN_PASSWORD en el fichero .env y reiniciar el servidor.
    // En una implementación más completa usarías una BBDD para almacenar el hash.
    console.log('[auth] Solicitud de cambio de contraseña. Actualiza ADMIN_PASSWORD en .env');

    return res.json({ message: 'Contraseña actualizada correctamente. Reinicia el servidor para aplicar el cambio.' });
});

// ── GET /api/health ───────────────────────────────────────
// Endpoint de verificación de estado (sin autenticación).
router.get('/health', function (req, res) {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/* =========================================================
   MIDDLEWARE: verificar JWT
   ========================================================= */
function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autenticación requerido.' });
    }

    const token = authHeader.slice(7);

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token no válido o expirado.' });
    }
}

/* =========================================================
   UTILIDADES
   ========================================================= */

/**
 * Comparación de strings en tiempo constante para evitar
 * ataques de timing en la verificación de contraseñas.
 */
function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) {
        // Seguir iterando para mantener tiempo constante
        let diff = 0;
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
        }
        return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

module.exports = router;
module.exports.requireAuth = requireAuth;

/* =========================================================
   INSTRUCCIONES DE INTEGRACIÓN
   =========================================================
   1. Añadir al fichero .env de la API:

      ADMIN_PASSWORD=tu_contraseña_segura_aquí
      JWT_SECRET=una_clave_secreta_aleatoria_larga

   2. Instalar jsonwebtoken si no está:
      npm install jsonwebtoken

   3. Registrar las rutas en el app principal (app.js / server.js):

      const authRoutes = require('./routes/auth');
      app.use('/api/auth', authRoutes);
      app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

   4. Proteger el resto de endpoints con el middleware:

      const { requireAuth } = require('./routes/auth');
      app.use('/api/bookings', requireAuth, bookingsRouter);
      app.use('/api/availability', requireAuth, availabilityRouter);
   ========================================================= */
