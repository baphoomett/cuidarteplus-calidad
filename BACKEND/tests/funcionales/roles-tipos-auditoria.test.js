/**
 * CP-07 Roles y tipos de examen (/roles, /tipo-examen)
 * CP-08 Auditoría (/auditoria)
 */
jest.mock("../../src/db", () => ({ pool: { query: jest.fn() } }));
jest.mock("morgan", () => () => (req, res, next) => next());

const request = require("supertest");
const { pool } = require("../../src/db");
const { cargarApp, bearer, rows, vacio, roles, AUTH_INVALIDAS } = require("../helpers/app");

let app;
beforeAll(() => {
  app = cargarApp();
});
beforeEach(() => pool.query.mockReset());

const q = pool.query;
const ADMIN = bearer({ usuarioId: 1, nombreUsuario: "admin" });
const SIN_ID = bearer({ usuarioId: 0 });
const EMPRESA = bearer({ usuarioId: 1, empresaId: 10 });
const conAuth = (req, h) => (h ? req.set("Authorization", h) : req);

const errores = [
  [new Error("x"), "x"],
  ["y", "y"],
];

describe("CP-07.A Roles (/roles)", () => {
  test("CP-07.1 crear rol devuelve 201 y audita", async () => {
    q.mockResolvedValueOnce(rows({ id: 4, nombre: "enfermero" })).mockResolvedValueOnce(vacio());
    const res = await request(app).post("/roles").set("Authorization", ADMIN).send({ nombre: "enfermero" });
    expect(res.status).toBe(201);
    expect(q.mock.calls[1][1]).toEqual(["admin", "ROLES_CREAR: creó rol enfermero"]);
    q.mockResolvedValueOnce(rows({ id: 5 })).mockResolvedValueOnce(vacio());
    await request(app).post("/roles").send({ nombre: "tecnico" });
    expect(q.mock.calls[3][1][0]).toBeNull();
  });

  test("CP-07.2 listar y obtener roles", async () => {
    q.mockResolvedValueOnce(rows({ id: 1 }, { id: 2 }));
    expect((await request(app).get("/roles")).body).toHaveLength(2);
    q.mockResolvedValueOnce(rows({ id: 1, nombre: "admin" }));
    expect((await request(app).get("/roles/1")).body.nombre).toBe("admin");
    q.mockResolvedValueOnce(vacio());
    expect((await request(app).get("/roles/9")).status).toBe(404);
  });

  test("CP-07.3 actualizar rol", async () => {
    q.mockResolvedValueOnce(rows({ id: 4, nombre: "x" })).mockResolvedValueOnce(vacio());
    expect((await request(app).put("/roles/4").send({ nombre: "x" })).status).toBe(200);
    expect(q.mock.calls[1][1][0]).toBeNull();
    q.mockResolvedValueOnce(vacio());
    expect((await request(app).put("/roles/9").send({ nombre: "x" })).status).toBe(404);
  });

  test("CP-07.4 eliminar rol", async () => {
    q.mockResolvedValueOnce(rows({ id: 4 })).mockResolvedValueOnce(vacio());
    const res = await request(app).delete("/roles/4").set("Authorization", "Bearer malo");
    expect(res.body).toEqual({ deleted: true });
    q.mockResolvedValueOnce(vacio());
    expect((await request(app).delete("/roles/9").set("Authorization", "Basic x")).status).toBe(404);
  });

  test.each(errores)("NF-02.37 errores de BD en /roles responden 500 (%p)", async (err, glosa) => {
    const llamadas = [
      () => request(app).post("/roles").send({ nombre: "z" }),
      () => request(app).get("/roles"),
      () => request(app).get("/roles/1"),
      () => request(app).put("/roles/1").send({ nombre: "z" }),
      () => request(app).delete("/roles/1"),
    ];
    for (const llamar of llamadas) {
      q.mockRejectedValueOnce(err);
      const res = await llamar();
      expect(res.status).toBe(500);
      expect(res.body.glosa).toBe(glosa);
    }
  });
});

describe("CP-07.B Tipos de examen (/tipo-examen)", () => {
  test("CP-07.5 lista tipos ordenados por nombre", async () => {
    q.mockResolvedValueOnce(rows({ id: 1, nombre: "Hemograma" }));
    const res = await request(app).get("/tipo-examen");
    expect(res.body[0].nombre).toBe("Hemograma");
    expect(q.mock.calls[0][0]).toMatch(/ORDER BY nombre ASC/);
  });

  test("CP-07.6 obtiene un tipo por ID o 404", async () => {
    q.mockResolvedValueOnce(rows({ id: 1 }));
    expect((await request(app).get("/tipo-examen/1")).status).toBe(200);
    q.mockResolvedValueOnce(vacio());
    expect((await request(app).get("/tipo-examen/9")).status).toBe(404);
  });

  test.each(errores)("NF-02.38 errores de BD responden 500 (%p)", async (err, glosa) => {
    q.mockRejectedValueOnce(err);
    expect((await request(app).get("/tipo-examen")).body.glosa).toBe(glosa);
    q.mockRejectedValueOnce(err);
    expect((await request(app).get("/tipo-examen/1")).body.glosa).toBe(glosa);
  });
});

describe("CP-08 Auditoría (/auditoria)", () => {
  test.each(AUTH_INVALIDAS)("CP-08.1 POST rechaza %s con 401", async (_d, h) => {
    const res = await conAuth(request(app).post("/auditoria").send({ accion: "X" }), h);
    expect(res.status).toBe(401);
  });

  test("CP-08.2 registra una acción con y sin detalles", async () => {
    q.mockResolvedValueOnce(rows({ id: 1 }));
    await request(app).post("/auditoria").set("Authorization", ADMIN).send({ accion: "VER", detalles: "ficha 3" });
    expect(q.mock.calls[0][1]).toEqual([1, "VER: ficha 3"]);
    q.mockResolvedValueOnce(rows({ id: 2 }));
    const res = await request(app).post("/auditoria").set("Authorization", SIN_ID).send({ accion: "VER" });
    expect(res.status).toBe(201);
    expect(q.mock.calls[1][1]).toEqual([null, "VER"]);
  });

  test.each(AUTH_INVALIDAS)("CP-08.3 GET rechaza %s con 401", async (_d, h) => {
    const res = await conAuth(request(app).get("/auditoria"), h);
    expect(res.status).toBe(401);
  });

  test("CP-08.4 administrador consulta todos los registros", async () => {
    q.mockResolvedValueOnce(roles("admin")).mockResolvedValueOnce(rows({ id: 1 }));
    const res = await request(app).get("/auditoria").set("Authorization", ADMIN);
    expect(res.body).toEqual([{ id: 1 }]);
  });

  test("CP-08.5 usuario no administrador recibe 403", async () => {
    q.mockResolvedValueOnce(roles("medico"));
    expect((await request(app).get("/auditoria").set("Authorization", ADMIN)).status).toBe(403);
  });

  test("CP-08.6 lógica empresa filtra por empresa del token", async () => {
    q.mockResolvedValueOnce(rows({ id: 3 }));
    await request(app).get("/auditoria").set("Authorization", EMPRESA);
    expect(q.mock.calls[0][1]).toEqual([10]);
  });

  test.each(errores)("NF-02.39 errores de BD responden 500 (%p)", async (err, glosa) => {
    q.mockRejectedValueOnce(err);
    expect((await request(app).post("/auditoria").set("Authorization", ADMIN).send({ accion: "a" })).body.glosa).toBe(glosa);
    q.mockRejectedValueOnce(err);
    expect((await request(app).get("/auditoria").set("Authorization", ADMIN)).body.glosa).toBe(glosa);
  });
});
