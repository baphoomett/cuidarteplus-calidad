import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4444";
const PERFIL = __ENV.PERFIL || "humo";
const perfiles = {
  humo: [
    { duration: "10s", target: 5 },
    { duration: "20s", target: 5 },
    { duration: "5s", target: 0 },
  ],
  carga: [
    { duration: "30s", target: 50 },
    { duration: "1m", target: 200 },
    { duration: "1m", target: 200 },
    { duration: "30s", target: 0 },
  ],
};

export const options = {
  stages: perfiles[PERFIL],
  thresholds: {
    http_req_duration: ["p(95)<300"],
    http_req_failed: ["rate<0.01"],
  },
};

export function setup() {
  const response = http.post(
    `${BASE_URL}/autenticacion/login`,
    JSON.stringify({ nombre_usuario: "admin", password: "admin" }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(response, { "login correcto": (res) => res.status === 200 });
  return { token: response.json("token") };
}

export default function (data) {
  const params = { headers: { Authorization: `Bearer ${data.token}` } };
  const pacientes = http.get(`${BASE_URL}/pacientes`, params);
  check(pacientes, {
    "listar pacientes responde 200": (res) => res.status === 200,
  });

  const examenes = http.get(`${BASE_URL}/examenes`, params);
  check(examenes, {
    "listar exámenes responde 200": (res) => res.status === 200,
  });

  sleep(1);
}
