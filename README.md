# Gallúa Backend

API del sistema de reservas de Gallúa Centro de Fisioterapia. Está escrita en
Node puro (sin Express ni ninguna librería externa), así que **no necesitas
`npm install`** para probarla.

## Cómo correrla

```
cd gallua-backend
node server.js
```

Vas a ver:

```
Gallúa backend escuchando en http://localhost:3001
```

La primera vez que corre, crea `data/db.json` a partir de `data/seed.json`
(especialidades, precios, paquetes y un paciente de prueba con 3 sesiones de
bono: teléfono `51999999999`). Ese archivo es tu base de datos — se
actualiza sola con cada cita nueva.

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/especialidades` | Lista de especialidades |
| GET | `/api/tipos-sesion` | Duración y precio de evaluación/seguimiento |
| GET | `/api/paquetes` | Paquetes de sesiones disponibles |
| GET | `/api/disponibilidad?fecha=YYYY-MM-DD` | Horarios y cuáles están ocupados ese día |
| GET | `/api/pacientes/:telefono/bono` | Sesiones disponibles en el bono del paciente |
| GET | `/api/pacientes/:telefono/citas` | Historial de citas del paciente |
| POST | `/api/citas` | Crea una cita (ver body abajo) |
| POST | `/api/citas/:id/recordatorio` | Dispara el recordatorio (stub de WhatsApp) |
| POST | `/api/citas/:id/reprogramar` | Cambia fecha/hora de una cita |
| POST | `/api/citas/:id/cancelar` | Cancela una cita y libera el horario |
| POST | `/api/paquetes/comprar` | Suma sesiones al bono de un paciente |
| POST | `/api/pagos/sena` | Cobra un monto (stub de pasarela de pago) |
| GET | `/api/salud` | Ping para saber si el servicio está arriba |

Body de `POST /api/citas`:

```json
{
  "telefono": "51987654321",
  "nombre": "María Pérez",
  "tipo": "seguimiento",
  "especialidad": "deportiva",
  "fecha": "2026-08-03",
  "hora": "10:30",
  "triaje": { "dolor": "...", "zona": "Rodilla", "ordenMedica": false, "evolucion": "1 a 4 semanas", "ropa": true },
  "pago": { "metodo": "sena", "senaPct": 50 }
}
```

`pago.metodo` puede ser `"bono"`, `"paquete"` (con `pago.paquete` = 5 o 10) o `"sena"` (con `pago.senaPct` = 20/50/100).

## Conectar el frontend

En `index.html` hay una constante al inicio del `<script>`:

```js
const API_BASE = 'http://localhost:3001';
```

Mientras el backend esté corriendo en esa dirección, la página ya consume
especialidades, precios, disponibilidad, bono y crea la cita de verdad. Si el
backend no responde, la página sigue funcionando con datos de demostración
(no se rompe nada) — vas a ver un aviso pequeño arriba del formulario
indicando si está "Conectado" o en "Modo demo".

Cuando despliegues el backend, cambia `API_BASE` por su URL pública (por
ejemplo `https://gallua-backend.onrender.com`).

## Reemplazar los stubs por servicios reales

Todo lo que hoy está "simulado" vive en `db.js`, marcado con `// STUB`:

- **`procesarPagoSena(monto)`** — hoy siempre responde `ok:true`. Ahí se
  integra Culqi o Niubiz: creas el cargo con su SDK/API usando las claves de
  `.env` (`CULQI_SECRET_KEY`, etc.) y devuelves `ok:false` si el banco lo
  rechaza.
- **`enviarRecordatorio(citaId)`** — hoy solo arma el mensaje y lo devuelve.
  Ahí se integra la API de WhatsApp Business (Meta Cloud API o Twilio) para
  enviarlo de verdad, y lo ideal es llamarlo desde una tarea programada
  (cron) que revise citas del día siguiente cada mañana.

## Pasar a una base de datos real

`data/db.json` funciona bien para probar o para un volumen bajo de citas,
pero un archivo no soporta bien muchos usuarios escribiendo al mismo tiempo.
Para producción, migra las funciones de `db.js` a Postgres (por ejemplo con
Supabase o la base de datos gestionada de Render/Railway) manteniendo las
mismas firmas de función — el resto del backend no cambia.

## Desplegar

Este backend necesita un proceso corriendo todo el tiempo (no es un sitio
estático), así que sirve en: Render.com (plan gratuito de "Web Service"),
Railway o Fly.io. En los tres casos: conectas el repositorio, el comando de
arranque es `node server.js`, y solo falta agregar las variables de entorno
de `.env.example` cuando conectes pagos y WhatsApp reales.
