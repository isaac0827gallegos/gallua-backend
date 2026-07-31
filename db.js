// db.js
// Capa de datos y reglas de negocio. Usa un archivo JSON como base de datos
// para que el backend corra sin instalar nada. Para producción real con
// varios usuarios simultáneos, migra estas mismas funciones a Postgres
// (ver README.md, sección "Pasar a una base de datos real").

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');
const SEED_PATH = path.join(__dirname, 'data', 'seed.json');

const HORARIOS_BASE = [
  '09:00', '09:45', '10:30', '11:15', '12:00',
  '15:00', '15:45', '16:30', '17:15', '18:00',
];

function ensureDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.copyFileSync(SEED_PATH, DB_PATH);
  }
}

function readDB() {
  ensureDB();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function generarCodigo() {
  return 'GAL-' + Math.floor(1000 + Math.random() * 9000);
}

function getOrCrearPaciente(data, telefono, nombre) {
  if (!data.pacientes[telefono]) {
    data.pacientes[telefono] = {
      nombre: nombre || 'Paciente',
      bonos: { inicial: 0, seguimiento: 0 },
    };
  } else if (nombre) {
    data.pacientes[telefono].nombre = nombre;
  }
  return data.pacientes[telefono];
}

module.exports = {
  HORARIOS_BASE,

  getEspecialidades() {
    return readDB().especialidades;
  },

  getTiposSesion() {
    return readDB().tiposSesion;
  },

  getPaquetes() {
    return readDB().paquetes;
  },

  getDisponibilidad(fecha) {
    const data = readDB();
    const ocupados = data.citasOcupadas[fecha] || [];
    return { fecha, horarios: HORARIOS_BASE, ocupados };
  },

  getBono(telefono) {
    const data = readDB();
    const p = data.pacientes[telefono];
    return p ? p.bonos : { inicial: 0, seguimiento: 0 };
  },

  getAllCitas() {
    const data = readDB();
    return [...data.citas].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  },

  comprarPaquete(telefono, sessions, nombre) {
    if (!telefono) throw new Error('Falta el teléfono del paciente');
    const data = readDB();
    const pkg = data.paquetes.find((p) => p.sessions === sessions);
    if (!pkg) throw new Error('Paquete no encontrado');

    const paciente = getOrCrearPaciente(data, telefono, nombre);
    // STUB de cobro — aquí se integra la pasarela de pago real (ver README).
    paciente.bonos.seguimiento += pkg.sessions;
    writeDB(data);
    return { ok: true, bono: paciente.bonos, referenciaPago: 'SIMULADO-' + Date.now() };
  },

  procesarPagoSena(monto) {
    // STUB — aquí se integra Culqi / Niubiz / Mercado Pago.
    // Debe devolver ok:false y un motivo si el cobro real es rechazado.
    return { ok: true, monto, referencia: 'SIMULADO-' + Date.now(), metodo: 'stub' };
  },

  crearCita({ telefono, nombre, tipo, especialidad, fecha, hora, triaje, pago }) {
    if (!telefono || !tipo || !especialidad || !fecha || !hora) {
      throw new Error('Faltan datos obligatorios para crear la cita');
    }
    const data = readDB();
    if (!data.tiposSesion[tipo]) throw new Error('Tipo de sesión inválido');

    const ocupados = data.citasOcupadas[fecha] || [];
    if (ocupados.includes(hora)) {
      throw new Error('Ese horario ya fue tomado, elige otro.');
    }

    const paciente = getOrCrearPaciente(data, telefono, nombre);
    const precio = data.tiposSesion[tipo].precio;
    let montoHoy = precio;

    if (pago && pago.metodo === 'bono') {
      if (!paciente.bonos[tipo] || paciente.bonos[tipo] <= 0) {
        throw new Error('No tienes sesiones disponibles en tu bono para este tipo de sesión');
      }
      paciente.bonos[tipo] -= 1;
      montoHoy = 0;
    } else if (pago && pago.metodo === 'paquete') {
      const pkg = data.paquetes.find((p) => p.sessions === pago.paquete);
      if (!pkg) throw new Error('Paquete inválido');
      const pagoResultado = module.exports.procesarPagoSena(pkg.price);
      if (!pagoResultado.ok) throw new Error('El pago del paquete no pudo procesarse');
      paciente.bonos.seguimiento += pkg.sessions;
      paciente.bonos[tipo] -= 1;
      montoHoy = pkg.price;
    } else if (pago && pago.metodo === 'sena') {
      const pct = pago.senaPct || 20;
      montoHoy = Math.round((precio * pct) / 100);
      const pagoResultado = module.exports.procesarPagoSena(montoHoy);
      if (!pagoResultado.ok) throw new Error('La seña no pudo procesarse');
    } else {
      const pagoResultado = module.exports.procesarPagoSena(montoHoy);
      if (!pagoResultado.ok) throw new Error('El pago no pudo procesarse');
    }

    const cita = {
      id: generarCodigo(),
      telefono,
      nombre: nombre || paciente.nombre,
      tipo,
      especialidad,
      fecha,
      hora,
      duracion: tipo === 'inicial' ? 60 : 45,
      triaje: triaje || {},
      pago: { metodo: (pago && pago.metodo) || 'completo', montoHoy },
      estado: 'confirmada',
      creada: new Date().toISOString(),
    };

    data.citas.push(cita);
    if (!data.citasOcupadas[fecha]) data.citasOcupadas[fecha] = [];
    data.citasOcupadas[fecha].push(hora);

    writeDB(data);
    return cita;
  },

  listCitasPorTelefono(telefono) {
    const data = readDB();
    return data.citas.filter((c) => c.telefono === telefono);
  },

  enviarRecordatorio(citaId) {
    const data = readDB();
    const cita = data.citas.find((c) => c.id === citaId);
    if (!cita) throw new Error('Cita no encontrada');
    // STUB — aquí se integra WhatsApp Business API (Twilio o Meta Cloud API).
    const mensaje = `Hola! Te recordamos tu cita de ${
      cita.tipo === 'inicial' ? 'Evaluación inicial' : 'Sesión de seguimiento'
    } el ${cita.fecha} a las ${cita.hora}. Responde CONFIRMAR o REPROGRAMAR.`;
    return { ok: true, enviadoA: cita.telefono, mensaje, proveedor: 'stub' };
  },

  reprogramarCita(citaId, nuevaFecha, nuevaHora) {
    if (!nuevaFecha || !nuevaHora) throw new Error('Falta la nueva fecha u hora');
    const data = readDB();
    const cita = data.citas.find((c) => c.id === citaId);
    if (!cita) throw new Error('Cita no encontrada');

    const ocupadosNuevoDia = data.citasOcupadas[nuevaFecha] || [];
    if (ocupadosNuevoDia.includes(nuevaHora)) throw new Error('Ese horario ya está tomado');

    data.citasOcupadas[cita.fecha] = (data.citasOcupadas[cita.fecha] || []).filter((h) => h !== cita.hora);
    if (!data.citasOcupadas[nuevaFecha]) data.citasOcupadas[nuevaFecha] = [];
    data.citasOcupadas[nuevaFecha].push(nuevaHora);

    cita.fecha = nuevaFecha;
    cita.hora = nuevaHora;
    writeDB(data);
    return cita;
  },

  cancelarCita(citaId) {
    const data = readDB();
    const cita = data.citas.find((c) => c.id === citaId);
    if (!cita) throw new Error('Cita no encontrada');
    cita.estado = 'cancelada';
    data.citasOcupadas[cita.fecha] = (data.citasOcupadas[cita.fecha] || []).filter((h) => h !== cita.hora);
    writeDB(data);
    return cita;
  },
};
