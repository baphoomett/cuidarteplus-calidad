/**
 * Helpers compartidos por las pruebas funcionales y de seguridad del backend.
 *
 * - La base de datos se reemplaza por un mock de `pool.query` (ver jest.mock en
 *   cada archivo de prueba), de modo que cada caso define exactamente qué
 *   devuelve PostgreSQL.
 * - La aplicación real (src/app.js) se carga interceptando `app.listen`, así se
 *   prueba el mismo cableado de rutas que en producción sin abrir un puerto.
 */
const express = require("express");
const jwt = require("jsonwebtoken");

const SECRET_POR_DEFECTO = "inseguro";

function cargarApp() {
  // app.js exporta la aplicación sin abrir un puerto durante las pruebas.
  return require("../../src/app");
}

function token(payload = {}, secret = SECRET_POR_DEFECTO, opts = { expiresIn: "2h" }) {
  return jwt.sign(
    { usuarioId: 1, nombreUsuario: "admin", ...payload },
    secret,
    opts
  );
}

const bearer = (payload, secret) => `Bearer ${token(payload, secret)}`;

/** Respuesta de pool.query con filas */
const rows = (...r) => ({ rows: r });
const vacio = () => ({ rows: [] });
/** Respuesta de la consulta de roles del usuario */
const roles = (...nombres) => rows(...nombres.map((nombre) => ({ nombre })));

/**
 * Devuelve el último handler de una ruta del router (saltando los middlewares
 * de validación). Se usa para probar código defensivo que la validación de
 * entrada vuelve inalcanzable por HTTP.
 */
function handlerDe(router, metodo, ruta) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === ruta && l.route.methods[metodo]
  );
  const pila = layer.route.stack;
  return pila[pila.length - 1].handle;
}

function resMock() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.setHeader = jest.fn();
  res.send = jest.fn(() => res);
  return res;
}

/** Cabeceras de autorización inválidas que toda ruta protegida debe rechazar */
const AUTH_INVALIDAS = [
  ["sin cabecera Authorization", undefined],
  ["esquema distinto de Bearer", "Basic YWRtaW46YWRtaW4="],
  ["token con firma inválida", "Bearer token.invalido.firma"],
];

module.exports = {
  cargarApp,
  token,
  bearer,
  rows,
  vacio,
  roles,
  handlerDe,
  resMock,
  AUTH_INVALIDAS,
  SECRET_POR_DEFECTO,
};
