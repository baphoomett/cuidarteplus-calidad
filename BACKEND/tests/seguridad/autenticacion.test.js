/**
 * Pruebas de seguridad - Autenticación y gestión de sesiones
 * (OWASP A02: Cryptographic Failures, A07: Identification and Authentication Failures)
 *
 * Cada prueba describe el comportamiento SEGURO esperado; un fallo es un hallazgo.
 */
jest.mock("../../src/db", () => ({ pool: { query: jest.fn() } }));
jest.mock("../../src/middleware/delay", () => () => (req, res, next) => next());
jest.mock("morgan", () => () => (req, res, next) => next());

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const authRouter = require("../../src/routes/auth");
const { cargarApp, bearer, rows, roles } = require("../helpers/app");
const { simularBD, consultas } = require("../helpers/bd");

let app;
beforeAll(() => {
  app = cargarApp();
});
beforeEach(() => {
  pool.query.mockReset();
  authRouter.resetLoginAttempts();
});

const q = pool.query;
const USUARIO_POR_NOMBRE = /FROM usuarios WHERE nombre_usuario = \$1/;
const ROLES_DE = /FROM usuario_roles ur/;

describe("SEG-07 Almacenamiento de contraseñas", () => {
  test("SEG-07.1 el registro no guarda la contraseña en texto plano", async () => {
    simularBD(q, [[/INSERT INTO usuarios/, rows({ id: 60, nombre_usuario: "nuevo" })]]);

    await request(app).post("/autenticacion/registro").send({
      nombre_usuario: "nuevo",
      password: "Clave$egura2026",
      correo: "nuevo@cuidarteplus.cl",
    });

    const [[, params]] = consultas(q, /INSERT INTO usuarios/);
    expect(params[1]).not.toBe("Clave$egura2026");
    // Se espera un hash con algoritmo lento y sal (bcrypt / argon2 / scrypt)
    expect(params[1]).toMatch(/^\$(2[aby]|argon2(id|i)?|scrypt)\$/);
  });

  test("SEG-07.2 la creación de usuarios por el administrador no guarda la contraseña en texto plano", async () => {
    simularBD(q, [
      [ROLES_DE, roles("admin")],
      [/INSERT INTO usuarios/, rows({ id: 61, nombre_usuario: "medico2" })],
    ]);

    await request(app)
      .post("/usuarios")
      .set("Authorization", bearer({ usuarioId: 1 }))
      .send({ nombre_usuario: "medico2", contrasena_hash: "Medico$Seguro2026", correo: "m2@c.cl" });

    const [[, params]] = consultas(q, /INSERT INTO usuarios/);
    expect(params[1]).not.toBe("Medico$Seguro2026");
  });

  test("SEG-07.3 el login no compara la contraseña recibida directamente contra la BD", async () => {
    // Si la BD guardara hashes, una contraseña igual al hash almacenado NO debe permitir entrar.
    const hash = "$2b$10$abcdefghijklmnopqrstuuOd6QK5Zr5mJcKjvQ5yX0bX8n9bQG2i";
    simularBD(q, [[USUARIO_POR_NOMBRE, rows({ id: 1, nombre_usuario: "admin", contrasena: hash })]]);

    const res = await request(app)
      .post("/autenticacion/login")
      .send({ nombre_usuario: "admin", password: hash });

    expect(res.status).toBe(401);
  });
});

describe("SEG-08 Protección contra fuerza bruta en el login", () => {
  test("SEG-08.1 tras 10 intentos fallidos consecutivos la API limita las peticiones (429)", async () => {
    simularBD(q, [[USUARIO_POR_NOMBRE, rows({ id: 1, nombre_usuario: "admin", contrasena: "admin" })]]);

    const estados = [];
    for (let i = 0; i < 15; i++) {
      const res = await request(app)
        .post("/autenticacion/login")
        .send({ nombre_usuario: "admin", password: `intento-${i}` });
      estados.push(res.status);
    }

    expect(estados).toContain(429);
  });
});

describe("SEG-09 Secreto JWT por defecto", () => {
  test("SEG-09.1 un token forjado con el secreto por defecto 'inseguro' es rechazado", async () => {
    const forjado = jwt.sign({ usuarioId: 1, nombreUsuario: "admin", rolNombre: "admin" }, "inseguro");
    simularBD(q, [
      [ROLES_DE, roles("admin")],
      [/FROM usuarios u/, rows({ id: 1, nombre_usuario: "admin", correo: "admin@cuidarteplus.com" })],
    ]);

    const res = await request(app).get("/usuarios").set("Authorization", `Bearer ${forjado}`);

    expect(res.status).toBe(401);
  });

  test("SEG-09.2 la aplicación no arranca con un secreto JWT embebido en el código", () => {
    const fuente = require("fs").readFileSync(require.resolve("../../src/routes/auth"), "utf8");
    const lineasConSecreto = fuente.split("\n").filter((l) => /JWT_SECRET\s*\|\|\s*["'][^"']+["']/.test(l));
    expect(lineasConSecreto).toEqual([]);
  });
});

describe("SEG-18 Política de contraseñas", () => {
  test.each([
    ["solo números", "123456"],
    ["solo minúsculas", "abcdef"],
    ["igual al nombre de usuario", "usuario1"],
  ])("SEG-18.1 el registro rechaza una contraseña débil (%s)", async (_d, password) => {
    simularBD(q, [[/INSERT INTO usuarios/, rows({ id: 70, nombre_usuario: "usuario1" })]]);

    const res = await request(app).post("/autenticacion/registro").send({
      nombre_usuario: "usuario1",
      password,
      correo: "usuario1@cuidarteplus.cl",
    });

    expect(res.status).toBe(400);
    expect(consultas(q, /INSERT INTO usuarios/)).toHaveLength(0);
  });
});

describe("SEG-22 Validación de tokens JWT (controles que SÍ funcionan)", () => {
  const RUTA = "/pacientes/1";

  test("SEG-22.1 rechaza un token expirado", async () => {
    const expirado = jwt.sign({ usuarioId: 1, exp: Math.floor(Date.now() / 1000) - 60 }, "inseguro");
    const res = await request(app).get(RUTA).set("Authorization", `Bearer ${expirado}`);
    expect(res.status).toBe(401);
  });

  test("SEG-22.2 rechaza un token sin firma (alg: none)", async () => {
    const sinFirma = jwt.sign({ usuarioId: 1 }, null, { algorithm: "none" });
    const res = await request(app).get(RUTA).set("Authorization", `Bearer ${sinFirma}`);
    expect(res.status).toBe(401);
  });

  test("SEG-22.3 rechaza un token firmado con otro secreto", async () => {
    const ajeno = jwt.sign({ usuarioId: 1 }, "otro-secreto");
    const res = await request(app).get(RUTA).set("Authorization", `Bearer ${ajeno}`);
    expect(res.status).toBe(401);
  });

  test("SEG-22.4 el token emitido en el login expira en 2 horas o menos y no incluye la contraseña", async () => {
    simularBD(q, [
      [USUARIO_POR_NOMBRE, rows({ id: 1, nombre_usuario: "admin", contrasena: "admin" })],
      [ROLES_DE, rows({ id: 1, nombre: "admin" })],
    ]);

    const res = await request(app)
      .post("/autenticacion/login")
      .send({ nombre_usuario: "admin", password: "admin" });

    const payload = jwt.decode(res.body.token);
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(2 * 60 * 60);
    expect(JSON.stringify(payload)).not.toMatch(/contrasena|password/);
  });

  test("SEG-22.5 el mensaje de error no revela si el usuario existe (anti-enumeración)", async () => {
    simularBD(q, [[USUARIO_POR_NOMBRE, rows({ id: 1, nombre_usuario: "admin", contrasena: "admin" })]]);
    const malaClave = await request(app)
      .post("/autenticacion/login")
      .send({ nombre_usuario: "admin", password: "x" });

    simularBD(q, []);
    const inexistente = await request(app)
      .post("/autenticacion/login")
      .send({ nombre_usuario: "fantasma", password: "x" });

    expect(malaClave.status).toBe(inexistente.status);
    expect(malaClave.body).toEqual(inexistente.body);
  });
});
