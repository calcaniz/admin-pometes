/* =========================================================
   RECEIPT.JS — Generación de justificantes de reserva
   La Llar de Pometes · Panel de Administración
   ========================================================= */

'use strict';

// Reserva activa para la que se está generando el justificante
var _receiptBooking = null;

// ── Modal de opciones ─────────────────────────────────────────────────────────

function _buildReceiptModal() {
    if (document.getElementById('receiptModalOverlay')) return;

    var el = document.createElement('div');
    el.className = 'modal-overlay';
    el.id = 'receiptModalOverlay';
    el.setAttribute('hidden', '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = [
        '<div class="modal" style="max-width:420px">',
          '<div class="modal-header">',
            '<h2>Generar justificante</h2>',
            '<button class="modal-close btn-icon" id="receiptModalClose" aria-label="Cerrar">',
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">',
                '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
              '</svg>',
            '</button>',
          '</div>',
          '<div class="modal-body" style="padding:24px">',
            '<div class="form-group" style="margin-bottom:16px">',
              '<label for="rm_payment_method">Forma de pago</label>',
              '<select id="rm_payment_method" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--white)">',
                '<option value="Transferencia bancaria">Transferencia bancaria</option>',
                '<option value="Bizum">Bizum</option>',
                '<option value="Tarjeta">Tarjeta</option>',
                '<option value="Airbnb">Airbnb</option>',
                '<option value="Booking.com">Booking.com</option>',
                '<option value="Efectivo">Efectivo</option>',
              '</select>',
            '</div>',
            '<div class="form-group">',
              '<label for="rm_issue_date">Fecha de emisión</label>',
              '<input type="date" id="rm_issue_date" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:14px">',
            '</div>',
          '</div>',
          '<div class="modal-footer" style="padding:16px 24px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px">',
            '<button class="btn btn-ghost" id="receiptModalCancelBtn">Cancelar</button>',
            '<button class="btn btn-primary" id="receiptModalPrintBtn">🖨️ Generar y abrir</button>',
          '</div>',
        '</div>'
    ].join('');

    document.body.appendChild(el);

    el.addEventListener('click', function (e) { if (e.target === el) closeReceiptModal(); });
    document.getElementById('receiptModalClose').addEventListener('click', closeReceiptModal);
    document.getElementById('receiptModalCancelBtn').addEventListener('click', closeReceiptModal);
    document.getElementById('receiptModalPrintBtn').addEventListener('click', function () {
        var paymentMethod = document.getElementById('rm_payment_method').value;
        var issueDate     = document.getElementById('rm_issue_date').value;
        closeReceiptModal();
        printReceipt(_receiptBooking, { payment_method: paymentMethod, issue_date: issueDate });
    });
}

function openReceiptModal(booking) {
    _buildReceiptModal();
    _receiptBooking = booking;

    // Forma de pago por defecto según el canal de origen
    var paymentDefaults = {
        airbnb:  'Airbnb',
        booking: 'Booking.com',
        direct:  'Transferencia bancaria',
        phone:   'Transferencia bancaria',
        email:   'Transferencia bancaria',
        other:   'Transferencia bancaria'
    };
    var sel = document.getElementById('rm_payment_method');
    sel.value = paymentDefaults[booking.source] || 'Transferencia bancaria';
    if (!sel.value) sel.selectedIndex = 0;

    // Fecha de emisión: hoy
    document.getElementById('rm_issue_date').value = new Date().toISOString().slice(0, 10);

    document.getElementById('receiptModalOverlay').removeAttribute('hidden');
}

function closeReceiptModal() {
    var el = document.getElementById('receiptModalOverlay');
    if (el) el.setAttribute('hidden', '');
}

// ── Generación del justificante ───────────────────────────────────────────────

function printReceipt(booking, options) {
    var checkIn  = booking.check_in  || booking.checkIn  || '';
    var checkOut = booking.check_out || booking.checkOut || '';

    // Número de justificante: año del check_in + ID con ceros a la izquierda
    var year       = checkIn ? checkIn.slice(0, 4) : String(new Date().getFullYear());
    var receiptNum = year + '-' + String(booking.id).padStart(3, '0');

    function fmtShort(iso) {
        if (!iso) return '—';
        var p = iso.slice(0, 10).split('-');
        return p[2] + '/' + p[1] + '/' + p[0];
    }

    function fmtLong(iso) {
        if (!iso) return '—';
        return new Date(iso.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('es-ES', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    function esc(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    var nights = (checkIn && checkOut)
        ? Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000)
        : 0;

    var totalPrice = (booking.total_price != null)
        ? new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2 }).format(booking.total_price) + ' €'
        : 'Pendiente de determinar';

    var issueDate = options.issue_date ? fmtShort(options.issue_date) : fmtShort(new Date().toISOString().slice(0, 10));

    var html = '<!DOCTYPE html>\n' +
'<html lang="es">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
'<title>Justificante ' + receiptNum + ' · La Llar de Pometes</title>\n' +
'<style>\n' +
'* { box-sizing: border-box; margin: 0; padding: 0; }\n' +
'body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; background: #fff; }\n' +
'@media screen { body { background: #f0ede9; } }\n' +
'.paper { max-width: 680px; margin: 0 auto; background: #fff; padding: 60px 70px; }\n' +
'@media screen { .paper { margin: 40px auto; box-shadow: 0 4px 24px rgba(0,0,0,.12); } }\n' +
'@media print { .no-print { display: none !important; } }\n' +
'.hdr { text-align: center; border-bottom: 3px solid #2C5F7A; padding-bottom: 28px; margin-bottom: 36px; }\n' +
'.hdr-name { font-size: 30px; font-weight: normal; color: #2C5F7A; letter-spacing: 2px; }\n' +
'.hdr-sub { font-family: Arial, sans-serif; font-size: 11px; color: #2A9D8F; letter-spacing: 3px; text-transform: uppercase; margin-top: 5px; }\n' +
'.hdr-doc { font-family: Arial, sans-serif; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 2px; margin-top: 20px; }\n' +
'.hdr-num { font-size: 22px; color: #2C5F7A; margin-top: 4px; font-family: Arial, sans-serif; font-weight: 600; }\n' +
'.fields { margin-bottom: 48px; }\n' +
'.field { display: flex; align-items: baseline; padding: 14px 0; border-bottom: 1px solid #e8e0d4; }\n' +
'.field:first-child { border-top: 1px solid #e8e0d4; }\n' +
'.fl { width: 200px; flex-shrink: 0; font-family: Arial, sans-serif; font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: .7px; }\n' +
'.fv { flex: 1; font-size: 15px; line-height: 1.5; }\n' +
'.fv.small { font-size: 13px; color: #555; font-style: italic; }\n' +
'.fv strong { font-size: 18px; color: #2C5F7A; }\n' +
'.ftr { border-top: 2px solid #2C5F7A; padding-top: 20px; font-family: Arial, sans-serif; font-size: 12px; color: #aaa; text-align: center; line-height: 1.9; }\n' +
'.actions { display: flex; justify-content: center; gap: 12px; margin-top: 36px; }\n' +
'.btn { padding: 11px 26px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-family: Arial, sans-serif; font-weight: 600; }\n' +
'.btn-p { background: #2C5F7A; color: #fff; }\n' +
'.btn-c { background: #e8e8e8; color: #333; }\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<div class="paper">\n' +

'<div class="hdr">\n' +
'  <div class="hdr-name">La Llar de Pometes</div>\n' +
'  <div class="hdr-sub">Riola &middot; Valencia</div>\n' +
'  <div class="hdr-doc">Justificante de reserva</div>\n' +
'  <div class="hdr-num">N.&ordm; ' + receiptNum + '</div>\n' +
'</div>\n' +

'<div class="fields">\n' +
'  <div class="field"><span class="fl">Hu&eacute;sped</span><span class="fv">' + esc(booking.guest_name || '&mdash;') + '</span></div>\n' +
'  <div class="field"><span class="fl">Estancia</span><span class="fv">Del ' + fmtLong(checkIn) + '<br>al ' + fmtLong(checkOut) + ' (' + nights + ' noche' + (nights !== 1 ? 's' : '') + ')</span></div>\n' +
'  <div class="field"><span class="fl">Alojamiento</span><span class="fv">Casa rural completa</span></div>\n' +
'  <div class="field"><span class="fl">Importe total</span><span class="fv"><strong>' + totalPrice + '</strong></span></div>\n' +
'  <div class="field"><span class="fl">IVA</span><span class="fv small">Exento</span></div>\n' +
'  <div class="field"><span class="fl">Concepto</span><span class="fv small">Alojamiento tur&iacute;stico sin servicios propios de la industria hotelera</span></div>\n' +
'  <div class="field"><span class="fl">Forma de pago</span><span class="fv">' + esc(options.payment_method) + '</span></div>\n' +
'  <div class="field"><span class="fl">Fecha de emisi&oacute;n</span><span class="fv">' + issueDate + '</span></div>\n' +
'</div>\n' +

'<div class="ftr">\n' +
'  La Llar de Pometes &middot; Riola &middot; Valencia<br>\n' +
'  info@lallardepometes.es &middot; lallardepometes.es\n' +
'</div>\n' +

'<div class="actions no-print">\n' +
'  <button class="btn btn-p" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>\n' +
'  <button class="btn btn-c" onclick="window.close()">Cerrar</button>\n' +
'</div>\n' +

'</div>\n' +
'</body>\n' +
'</html>';

    var w = window.open('', '_blank', 'width=800,height=950,menubar=no,toolbar=no');
    if (!w) {
        alert('El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.');
        return;
    }
    w.document.write(html);
    w.document.close();
}
