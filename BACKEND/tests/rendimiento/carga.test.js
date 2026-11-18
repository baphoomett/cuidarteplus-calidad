/**
 * Pruebas de rendimiento con autocannon contra la API levantada en Docker.
 *
 * Requisitos:  docker compose up -d   (desde la raíz del proyecto)
 * Ejecución:   npm run test:rendimiento
 *
 * Criterio de aceptación (RNF-01): con 20 usuarios concurrentes durante 10 s
 * el percentil 97,5 de latencia debe ser < 1000 ms y sin errores/timeouts.
 */
const autocannon = require("autocannon");

const API = process.env.API_URL || "http://localhost:4444";
const DURACION = Number(process.env.DURACION_S || 10);
const CONEXIONES = 20;
const P_LIMITE_MS = 1000;

let MEDICO;

function carga({ path, ...opciones }) {
  return autocannon({ url: `${API}${path}`, connections: CONEXIONES, duration: DURACION, timeout: 20, ...opciones });
}

function resumen(nombre, r) {
  const fila = {
    prueba: nombre,
    req_seg: r.requests.average,
    p50_ms: r.latency.p50,
    p97_5_ms: r.latency.p97_5,
    max_ms: r.latency.max,
    errores: r.errors,
    timeouts: r.timeouts,
    no_2xx: r.non2xx,
  };
  // Evidencia para el informe
  process.stdout.write(`${JSON.stringify(fila)}\n`);
  return fila;
}

beforeAll(async () => {
  const res = await fetch(`${API}/autenticacion/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre_usuario: "medico", password: "medico" }),
  }).catch(() => null);
  if (!res || res.status !== 200) {
    throw new Error(`La API no responde en ${API}. Ejecute "docker compose up -d" antes de estas pruebas.`);
  }
  MEDICO = (await res.json()).token;
});

describe("REN-01 Tiempo de respuesta de endpoints de consulta", () => {
  test("REN-01.1 GET /tipo-examen soporta 20 usuarios concurrentes con p97,5 < 1 s", async () => {
    const r = resumen("GET /tipo-examen", await carga({ path: "/tipo-examen" }));
    expect(r.errores + r.timeouts + r.no_2xx).toBe(0);
    expect(r.p97_5_ms).toBeLessThan(P_LIMITE_MS);
  });

  test("REN-01.2 GET /pacientes (listado clínico) responde con p97,5 < 1 s", async () => {
    const r = resumen(
      "GET /pacientes",
      await carga({ path: "/pacientes", headers: { Authorization: `Bearer ${MEDICO}` } })
    );
    expect(r.errores + r.timeouts + r.no_2xx).toBe(0);
    expect(r.p97_5_ms).toBeLessThan(P_LIMITE_MS);
  });

  test("REN-01.3 GET /examenes (listado de exámenes) responde con p97,5 < 1 s", async () => {
    const r = resumen(
      "GET /examenes",
      await carga({ path: "/examenes", headers: { Authorization: `Bearer ${MEDICO}` } })
    );
    expect(r.errores + r.timeouts + r.no_2xx).toBe(0);
    expect(r.p97_5_ms).toBeLessThan(P_LIMITE_MS);
  });
});

describe("REN-02 Autenticación bajo carga", () => {
  test("REN-02.1 POST /autenticacion/login mantiene p97,5 < 1 s y 0 errores", async () => {
    const r = resumen(
      "POST /autenticacion/login",
      await carga({
        path: "/autenticacion/login",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre_usuario: "medico", password: "medico" }),
      })
    );
    expect(r.errores + r.timeouts + r.no_2xx).toBe(0);
    expect(r.p97_5_ms).toBeLessThan(P_LIMITE_MS);
  });
});
