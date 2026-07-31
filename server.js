// server.js
// API del sistema de reservas de Gallúa. Corre con Node puro (sin dependencias
// externas), así que no hace falta "npm install" para probarlo:
//
//   node server.js
//
// Ver README.md para los endpoints, cómo conectar el frontend, y cómo
// reemplazar los stubs de pago/WhatsApp por integraciones reales.

const http = require('http');
const { URL } = require('url');
const db = require('./db');

const PORT = process.env.PORT || 3001;

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('El cuerpo de la solicitud no es JSON válido'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    // ---- catálogo ----
    if (method === 'GET' && pathname === '/api/especialidades') {
      return send(res, 200, db.getEspecialidades());
    }
    if (method === 'GET' && pathname === '/api/tipos-sesion') {
      return send(res, 200, db.getTiposSesion());
    }
    if (method === 'GET' && pathname === '/api/paquetes') {
      return send(res, 200, db.getPaquetes());
    }

    // ---- disponibilidad ----
    if (method === 'GET' && pathname === '/api/disponibilidad') {
      const fecha = parsed.searchParams.get('fecha');
      if (!fecha) return send(res, 400, { error: 'Falta el parámetro fecha (YYYY-MM-DD)' });
      return send(res, 200, db.getDisponibilidad(fecha));
    }

    // ---- panel de administración ----
    if (method === 'GET' && pathname === '/api/citas') {
      const clave = parsed.searchParams.get('clave');
      const claveEsperada = process.env.ADMIN_KEY || 'gallua2026';
      if (clave !== claveEsperada) {
        return send(res, 401, { error: 'Clave incorrecta' });
      }
      return send(res, 200, db.getAllCitas());
    }

    // ---- pacientes / bonos ----
    if (method === 'GET' && /^\/api\/pacientes\/[^/]+\/bono$/.test(pathname)) {
      const telefono = decodeURIComponent(pathname.split('/')[3]);
      return send(res, 200, db.getBono(telefono));
    }
    if (method === 'GET' && /^\/api\/pacientes\/[^/]+\/citas$/.test(pathname)) {
      const telefono = decodeURIComponent(pathname.split('/')[3]);
      return send(res, 200, db.listCitasPorTelefono(telefono));
    }

    // ---- paquetes / pagos ----
    if (method === 'POST' && pathname === '/api/paquetes/comprar') {
      const body = await readBody(req);
      return send(res, 200, db.comprarPaquete(body.telefono, Number(body.sessions), body.nombre));
    }
    if (method === 'POST' && pathname === '/api/pagos/sena') {
      const body = await readBody(req);
      return send(res, 200, db.procesarPagoSena(Number(body.monto)));
    }

    // ---- citas ----
    if (method === 'POST' && pathname === '/api/citas') {
      const body = await readBody(req);
      const cita = db.crearCita(body);
      return send(res, 201, cita);
    }
    if (method === 'POST' && /^\/api\/citas\/[^/]+\/recordatorio$/.test(pathname)) {
      const id = decodeURIComponent(pathname.split('/')[3]);
      return send(res, 200, db.enviarRecordatorio(id));
    }
    if (method === 'POST' && /^\/api\/citas\/[^/]+\/reprogramar$/.test(pathname)) {
      const id = decodeURIComponent(pathname.split('/')[3]);
      const body = await readBody(req);
      return send(res, 200, db.reprogramarCita(id, body.fecha, body.hora));
    }
    if (method === 'POST' && /^\/api\/citas\/[^/]+\/cancelar$/.test(pathname)) {
      const id = decodeURIComponent(pathname.split('/')[3]);
      return send(res, 200, db.cancelarCita(id));
    }

    // ---- salud del servicio ----
    if (method === 'GET' && pathname === '/api/salud') {
      return send(res, 200, { ok: true, servicio: 'gallua-backend', hora: new Date().toISOString() });
    }

    send(res, 404, { error: 'Ruta no encontrada' });
  } catch (err) {
    send(res, 400, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Gallúa backend escuchando en http://localhost:${PORT}`);
});
