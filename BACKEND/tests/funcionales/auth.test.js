/**
 * CP-01 Inicio de sesión y CP-02 Registro de pacientes (POST /autenticacion/*)
 */
jest.mock("../../src/db", () => ({ pool: { query: jest.fn() } }));
jest.mock("morgan", () => () => (req, res, next) => next());

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { cargarApp, rows, vacio } = require("../helpers/app");

let app;
beforeAll(() => {
  app = cargarApp();
});
beforeEach(() => pool.query.mockReset());

const q = pool.query;

describe("CP-01 Inicio de sesión", () => {
  test("CP-01.1 credenciales válidas devuelven un JWT con rol y paciente", async () => {
    q.mockResolvedValueOnce(rows({ id: 7, nombre_usuario: "paciente", contrasena: "paciente" }))
      .mockResolvedValueOnce(rows({ id: 3, nombre: "paciente" }))
      .mockResolvedValueOnce(rows({ id: 11 }))
      .mockResolvedValueOnce(vacio());

    const res = await request(app)
      .post("/autenticacion/login")
      .send({ nombre_usuario: "paciente", password: "paciente" });

    expect(res.status).toBe(200);
    const payload = jwt.decode(res.body.token);
    expect(payload).toMatchObject({
      usuarioId: 7,
      nombreUsuario: "paciente",
      rolId: 3,
      rolNombre: "paciente",
      pacienteId: 11,
    });
    expect(q.mock.calls[3][1]).toEqual([7, "LOGIN: usuario inició sesión"]);
  });

  test("CP-01.2 usuario sin roles ni ficha obtiene token con rol nulo", async () => {
    q.mockResolvedValueOnce(rows({ id: 9, nombre_usuario: "nuevo", contrasena: "clave1" }))
      .mockResolvedValueOnce(vacio())
      .mockResolvedValueOnce(vacio())
      .mockResolvedValueOnce(vacio());
    const res = await request(app)
      .post("/autenticacion/login")
      .send({ nombre_usuario: "nuevo", password: "clave1" });
    const payload = jwt.decode(res.body.token);
    expect(payload.rolNombre).toBeNull();
    expect(payload.rolId).toBeNull();
    expect(payload.pacienteId).toBeNull();
  });

  test("CP-01.3 usuario inexistente responde 401", async () => {
    q.mockResolvedValueOnce(vacio());
    const res = await request(app)
      .post("/autenticacion/login")
      .send({ nombre_usuario: "fantasma", password: "x" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Credenciales inválidas");
  });

  test("CP-01.4 contraseña incorrecta responde 401", async () => {
    q.mockResolvedValueOnce(rows({ id: 1, nombre_usuario: "admin", contrasena: "admin" }));
    const res = await request(app)
      .post("/autenticacion/login")
      .send({ nombre_usuario: "admin", password: "otra" });
    expect(res.status).toBe(401);
  });

  test("CP-01.5 datos incompletos responden 400 sin consultar la BD", async () => {
    const res = await request(app).post("/autenticacion/login").send({});
    expect(res.status).toBe(400);
    expect(q).not.toHaveBeenCalled();
  });

  test("NF-02.7 error de base de datos responde 500", async () => {
    q.mockRejectedValueOnce(new Error("db caída"));
    const res = await request(app)
      .post("/autenticacion/login")
      .send({ nombre_usuario: "admin", password: "admin" });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Error en login");
  });

  test("NF-02.8 error sin mensaje usa toString()", async () => {
    q.mockRejectedValueOnce("conexión rechazada");
    const res = await request(app)
      .post("/autenticacion/login")
      .send({ nombre_usuario: "admin", password: "admin" });
    expect(res.body.glosa).toBe("conexión rechazada");
  });
});

describe("CP-02 Registro de pacientes", () => {
  const base = { nombre_usuario: "juanito", password: "secreto1", correo: "j@c.cl" };
  const usuarioCreado = { id: 20, nombre_usuario: "juanito", correo: "j@c.cl" };

  test("CP-02.1 registro sin RUT crea usuario con rol paciente", async () => {
    q.mockResolvedValueOnce(vacio()) // duplicados
      .mockResolvedValueOnce(rows(usuarioCreado)) // insert usuario
      .mockResolvedValueOnce(rows({ id: 3 })) // rol paciente
      .mockResolvedValueOnce(vacio()) // insert usuario_roles
      .mockResolvedValueOnce(vacio()); // auditoría
    const res = await request(app).post("/autenticacion/registro").send(base);
    expect(res.status).toBe(201);
    expect(res.body.usuario).toEqual(usuarioCreado);
    expect(q.mock.calls[3][1]).toEqual([20, 3]);
  });

  test("CP-02.2 registro con RUT nuevo crea la ficha básica del paciente", async () => {
    q.mockResolvedValueOnce(vacio()) // rut no existe
      .mockResolvedValueOnce(vacio())
      .mockResolvedValueOnce(rows(usuarioCreado))
      .mockResolvedValueOnce(vacio()) // sin rol paciente configurado
      .mockResolvedValueOnce(vacio()) // insert paciente
      .mockResolvedValueOnce(vacio());
    const res = await request(app)
      .post("/autenticacion/registro")
      .send({ ...base, rut: "12.345.678-5" });
    expect(res.status).toBe(201);
    expect(q.mock.calls[0][1]).toEqual(["12345678-5"]);
    expect(q.mock.calls[4][0]).toMatch(/INSERT INTO pacientes/);
  });

  test("CP-02.3 registro con RUT de ficha sin cuenta vincula la ficha existente", async () => {
    q.mockResolvedValueOnce(rows({ id: 5, usuario_id: null }))
      .mockResolvedValueOnce(vacio())
      .mockResolvedValueOnce(rows(usuarioCreado))
      .mockResolvedValueOnce(rows({ id: 3 }))
      .mockResolvedValueOnce(vacio())
      .mockResolvedValueOnce(vacio())
      .mockResolvedValueOnce(vacio());
    const res = await request(app)
      .post("/autenticacion/registro")
      .send({ ...base, rut: "12345678-5" });
    expect(res.status).toBe(201);
    expect(q.mock.calls[5][0]).toMatch(/UPDATE pacientes SET usuario_id/);
  });

  test("CP-02.4 RUT que ya tiene cuenta responde 400", async () => {
    q.mockResolvedValueOnce(rows({ id: 5, usuario_id: 99 }));
    const res = await request(app)
      .post("/autenticacion/registro")
      .send({ ...base, rut: "12345678-5" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("RUT ya registrado");
  });

  test("CP-02.5 usuario o correo duplicado responde 400", async () => {
    q.mockResolvedValueOnce(rows({ id: 1 }));
    const res = await request(app).post("/autenticacion/registro").send(base);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Usuario o correo duplicado");
  });

  test("CP-02.7 violación de unicidad en BD (23505) responde 400", async () => {
    q.mockResolvedValueOnce(vacio()).mockRejectedValueOnce({ code: "23505" });
    const res = await request(app).post("/autenticacion/registro").send(base);
    expect(res.status).toBe(400);
    expect(res.body.glosa).toBe("El nombre de usuario o correo ya existe");
  });

  test("NF-02.9 otro error de BD responde 500", async () => {
    q.mockRejectedValueOnce(new Error("timeout"));
    const res = await request(app).post("/autenticacion/registro").send(base);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe("timeout");
  });

  test("NF-02.10 error sin mensaje usa toString()", async () => {
    q.mockRejectedValueOnce("caído");
    const res = await request(app).post("/autenticacion/registro").send(base);
    expect(res.body.glosa).toBe("caído");
  });
});
