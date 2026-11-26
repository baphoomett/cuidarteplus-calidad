/**
 * Pruebas de seguridad - Control de acceso (OWASP A01: Broken Access Control)
 *
 * Cada prueba verifica el comportamiento seguro esperado para el control de acceso.
 */
jest.mock("../../src/db", () => ({ pool: { query: jest.fn() } }));
jest.mock("../../src/middleware/delay", () => () => (req, res, next) => next());
jest.mock("morgan", () => () => (req, res, next) => next());

const request = require("supertest");
const { pool } = require("../../src/db");
const { cargarApp, bearer, rows, roles } = require("../helpers/app");
const { simularBD, consultas } = require("../helpers/bd");

let app;
beforeAll(() => {
  app = cargarApp();
});
beforeEach(() => pool.query.mockReset());

const q = pool.query;
const ADMIN = bearer({ usuarioId: 1, nombreUsuario: "admin" });
const MEDICO = bearer({ usuarioId: 2, nombreUsuario: "medico" });
const PACIENTE = bearer({ usuarioId: 3, nombreUsuario: "paciente" });

const ROLES_DE = /FROM usuario_roles ur/;
const PACIENTE_DE_USUARIO = /SELECT id FROM pacientes WHERE usuario_id/;

const FICHA_CLINICA = {
  id: 2,
  rut: "16789456-K",
  primer_nombre: "María",
  apellido_paterno: "González",
  email: "maria.gonzalez@gmail.com",
  telefono: "+56981112233",
  direccion: "Los Leones 456",
  grupo_sanguineo: "A+",
  alergias: "Penicilina",
  enfermedades_cronicas: "Ninguna",
};

describe("SEG-01 Ficha clínica expuesta sin autenticación (GET /pacientes/buscar/rut/:rut)", () => {
  test("SEG-01.1 un visitante anónimo no puede consultar la ficha de un paciente por RUT", async () => {
    simularBD(q, [[/WHERE p.rut = \$1/, rows(FICHA_CLINICA)]]);

    const res = await request(app).get("/pacientes/buscar/rut/16.789.456-K");

    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty("alergias");
    expect(consultas(q, /FROM pacientes/)).toHaveLength(0);
  });

  test("SEG-01.2 un paciente autenticado no puede consultar la ficha de OTRO paciente por RUT", async () => {
    simularBD(q, [
      [ROLES_DE, roles("paciente")],
      [PACIENTE_DE_USUARIO, rows({ id: 1 })],
      [/WHERE p.rut = \$1/, rows(FICHA_CLINICA)],
    ]);

    const res = await request(app)
      .get("/pacientes/buscar/rut/16789456-K")
      .set("Authorization", PACIENTE);

    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty("enfermedades_cronicas");
  });
});

describe("SEG-02 Eliminación de usuarios sin autenticación (DELETE /usuarios/:id)", () => {
  test("SEG-02.1 un visitante anónimo no puede eliminar al administrador", async () => {
    simularBD(q, [[/DELETE FROM usuarios/, rows({ id: 1, nombre_usuario: "admin" })]]);

    const res = await request(app).delete("/usuarios/1");

    expect(res.status).toBe(401);
    expect(consultas(q, /DELETE FROM usuarios/)).toHaveLength(0);
  });

  test("SEG-02.2 un paciente autenticado no puede eliminar a otros usuarios", async () => {
    simularBD(q, [
      [ROLES_DE, roles("paciente")],
      [/DELETE FROM usuarios/, rows({ id: 2, nombre_usuario: "medico" })],
    ]);

    const res = await request(app).delete("/usuarios/2").set("Authorization", PACIENTE);

    expect(res.status).toBe(403);
    expect(consultas(q, /DELETE FROM usuarios/)).toHaveLength(0);
  });
});

describe("SEG-03 Administración de roles sin autenticación (/roles)", () => {
  test("SEG-03.1 un visitante anónimo no puede crear roles", async () => {
    simularBD(q, [[/INSERT INTO roles/, rows({ id: 9, nombre: "superadmin" })]]);
    const res = await request(app).post("/roles").send({ nombre: "superadmin" });
    expect(res.status).toBe(401);
    expect(consultas(q, /INSERT INTO roles/)).toHaveLength(0);
  });

  test("SEG-03.2 un visitante anónimo no puede renombrar el rol 'paciente' a 'admin'", async () => {
    simularBD(q, [[/UPDATE roles/, rows({ id: 3, nombre: "admin" })]]);
    const res = await request(app).put("/roles/3").send({ nombre: "admin" });
    expect(res.status).toBe(401);
    expect(consultas(q, /UPDATE roles/)).toHaveLength(0);
  });

  test("SEG-03.3 un visitante anónimo no puede eliminar el rol administrador", async () => {
    simularBD(q, [[/DELETE FROM roles/, rows({ id: 1, nombre: "admin" })]]);
    const res = await request(app).delete("/roles/1");
    expect(res.status).toBe(401);
    expect(consultas(q, /DELETE FROM roles/)).toHaveLength(0);
  });

  test("SEG-03.4 un médico autenticado no puede crear roles (solo admin)", async () => {
    simularBD(q, [
      [ROLES_DE, roles("medico")],
      [/INSERT INTO roles/, rows({ id: 9, nombre: "superadmin" })],
    ]);
    const res = await request(app)
      .post("/roles")
      .set("Authorization", MEDICO)
      .send({ nombre: "superadmin" });
    expect(res.status).toBe(403);
  });
});

describe("SEG-04 Escalamiento de privilegios al crear usuarios (POST /usuarios)", () => {
  test("SEG-04.1 un paciente no puede crear una cuenta con rol administrador", async () => {
    simularBD(q, [
      [ROLES_DE, roles("paciente")],
      [/INSERT INTO usuarios/, rows({ id: 99, nombre_usuario: "atacante" })],
    ]);

    const res = await request(app)
      .post("/usuarios")
      .set("Authorization", PACIENTE)
      .send({
        nombre_usuario: "atacante",
        contrasena_hash: "M3dico$Seguro2026",
        correo: "atacante@evil.cl",
        rol_id: 1,
      });

    expect(res.status).toBe(403);
    expect(consultas(q, /INSERT INTO usuarios/)).toHaveLength(0);
    expect(consultas(q, /INSERT INTO usuario_roles/)).toHaveLength(0);
  });
});

describe("SEG-05 Autoasignación de rol administrador (PUT /usuarios/:id)", () => {
  test("SEG-05.1 un médico no puede cambiar su propio rol a administrador", async () => {
    simularBD(q, [
      [ROLES_DE, roles("medico")],
      [/UPDATE usuarios/, rows({ id: 2, nombre_usuario: "medico" })],
      [/FROM usuarios u/, rows({ id: 2, nombre_usuario: "medico", rol_id: 1, rol_nombre: "admin" })],
    ]);

    const res = await request(app)
      .put("/usuarios/2")
      .set("Authorization", MEDICO)
      .send({ nombre_usuario: "medico", rol_id: 1 });

    expect(res.status).toBe(403);
    expect(consultas(q, /INSERT INTO usuario_roles/)).toHaveLength(0);
  });

  test("SEG-05.2 un médico no puede otorgar el rol administrador a otro usuario", async () => {
    simularBD(q, [[ROLES_DE, roles("medico")]]);

    const res = await request(app)
      .put("/usuarios/3")
      .set("Authorization", MEDICO)
      .send({ nombre_usuario: "paciente", rol_id: 1 });

    expect(res.status).toBe(403);
    expect(consultas(q, /INSERT INTO usuario_roles/)).toHaveLength(0);
  });
});

describe("SEG-06 Apropiación de ficha clínica en el registro (POST /autenticacion/registro)", () => {
  test("SEG-06.1 registrarse con el RUT de un paciente existente no vincula su historial clínico", async () => {
    simularBD(q, [
      [/SELECT id, usuario_id FROM pacientes WHERE rut/, rows({ id: 2, usuario_id: null })],
      [/INSERT INTO usuarios/, rows({ id: 50, nombre_usuario: "intruso" })],
      [/SELECT id FROM roles WHERE nombre = 'paciente'/, rows({ id: 3 })],
    ]);

    const res = await request(app).post("/autenticacion/registro").send({
      nombre_usuario: "intruso",
      password: "Clave$egura2026",
      correo: "intruso@evil.cl",
      rut: "16.789.456-K",
    });

    // Sin verificación de identidad (correo de la ficha, código, etc.) no debe
    // asociarse la cuenta nueva a la ficha clínica de otra persona.
    expect(consultas(q, /UPDATE pacientes SET usuario_id/)).toHaveLength(0);
    expect(res.status).not.toBe(201);
  });
});

describe("SEG-16 Asignación masiva en la ficha del paciente (PUT /pacientes/:id)", () => {
  test("SEG-16.1 un paciente no puede reasignar el usuario dueño de su ficha", async () => {
    simularBD(q, [
      [ROLES_DE, roles("paciente")],
      [PACIENTE_DE_USUARIO, rows({ id: 1 })],
      [/UPDATE pacientes SET/, rows({ id: 1, usuario_id: 1 })],
    ]);

    await request(app)
      .put("/pacientes/1")
      .set("Authorization", PACIENTE)
      .send({ telefono: "+56911111111", usuario_id: 1 });

    const updates = consultas(q, /UPDATE pacientes SET/);
    expect(updates.some(([sql]) => /usuario_id=/.test(sql))).toBe(false);
  });

  test("SEG-16.2 un paciente no puede modificar su propio RUT", async () => {
    simularBD(q, [
      [ROLES_DE, roles("paciente")],
      [PACIENTE_DE_USUARIO, rows({ id: 1 })],
      [/UPDATE pacientes SET/, rows({ id: 1, rut: "99999999-9" })],
    ]);

    await request(app)
      .put("/pacientes/1")
      .set("Authorization", PACIENTE)
      .send({ rut: "99999999-9" });

    const updates = consultas(q, /UPDATE pacientes SET/);
    expect(updates.some(([sql]) => /rut=/.test(sql))).toBe(false);
  });
});

describe("SEG-17 Registros de auditoría falsificables (POST /auditoria)", () => {
  test("SEG-17.1 un paciente no puede insertar eventos arbitrarios en la bitácora", async () => {
    simularBD(q, [
      [ROLES_DE, roles("paciente")],
      [/INSERT INTO auditoria/, rows({ id: 500, accion: "LOGIN: admin borró los exámenes" })],
    ]);

    const res = await request(app)
      .post("/auditoria")
      .set("Authorization", PACIENTE)
      .send({ accion: "LOGIN", detalles: "admin borró los exámenes" });

    expect(res.status).toBe(403);
    expect(consultas(q, /INSERT INTO auditoria/)).toHaveLength(0);
  });
});

describe("SEG-20 Archivos subidos accesibles sin autenticación (/files/documentos)", () => {
  const fs = require("fs");
  const path = require("path");
  const archivo = path.join(__dirname, "..", "..", "uploads", "documentos", "seg-20-resultado.pdf");

  beforeAll(() => fs.writeFileSync(archivo, "%PDF-1.4 resultado confidencial"));
  afterAll(() => fs.rmSync(archivo, { force: true }));

  test("SEG-20.1 un visitante anónimo no puede descargar documentos del directorio público", async () => {
    const res = await request(app).get("/files/documentos/seg-20-resultado.pdf");
    expect([401, 403, 404]).toContain(res.status);
  });
});

describe("SEG-21 Controles de acceso horizontales que SÍ funcionan (IDOR)", () => {
  test("SEG-21.1 un paciente no puede ver la ficha de otro paciente por ID", async () => {
    simularBD(q, [
      [ROLES_DE, roles("paciente")],
      [PACIENTE_DE_USUARIO, rows({ id: 1 })],
    ]);
    const res = await request(app).get("/pacientes/2").set("Authorization", PACIENTE);
    expect(res.status).toBe(403);
  });

  test("SEG-21.2 un paciente no puede listar los exámenes de otro paciente", async () => {
    simularBD(q, [
      [ROLES_DE, roles("paciente")],
      [PACIENTE_DE_USUARIO, rows({ id: 1 })],
    ]);
    const res = await request(app).get("/examenes/paciente/2").set("Authorization", PACIENTE);
    expect(res.status).toBe(403);
  });

  test("SEG-21.3 un paciente no puede descargar documentos de otro paciente", async () => {
    simularBD(q, [
      [ROLES_DE, roles("paciente")],
      [/FROM documentos_examen de/, rows({ id: 5, nombre_archivo: "x.pdf", usuario_id: 99 })],
    ]);
    const res = await request(app).get("/documentos/5").set("Authorization", PACIENTE);
    expect(res.status).toBe(403);
  });

  test("SEG-21.4 un paciente no puede listar todos los usuarios", async () => {
    simularBD(q, [[ROLES_DE, roles("paciente")]]);
    const res = await request(app).get("/usuarios").set("Authorization", PACIENTE);
    expect(res.status).toBe(403);
  });

  test("SEG-21.5 un médico no puede eliminar pacientes (solo admin)", async () => {
    simularBD(q, [[ROLES_DE, roles("medico")]]);
    const res = await request(app).delete("/pacientes/2").set("Authorization", MEDICO);
    expect(res.status).toBe(403);
    expect(consultas(q, /DELETE FROM pacientes/)).toHaveLength(0);
  });

  test("SEG-21.6 un paciente no puede ver la bitácora de auditoría", async () => {
    simularBD(q, [[ROLES_DE, roles("paciente")]]);
    const res = await request(app).get("/auditoria").set("Authorization", PACIENTE);
    expect(res.status).toBe(403);
  });

  test("SEG-21.7 el administrador sí puede ver la bitácora de auditoría", async () => {
    simularBD(q, [
      [ROLES_DE, roles("admin")],
      [/FROM auditoria a/, rows({ id: 1, accion: "LOGIN" })],
    ]);
    const res = await request(app).get("/auditoria").set("Authorization", ADMIN);
    expect(res.status).toBe(200);
  });
});
