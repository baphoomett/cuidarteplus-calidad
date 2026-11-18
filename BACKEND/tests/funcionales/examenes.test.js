/**
 * CP-04 Gestión de exámenes médicos (/examenes)
 */
jest.mock("../../src/db", () => ({ pool: { query: jest.fn() } }));
jest.mock("../../src/middleware/delay", () => () => (req, res, next) => next());
jest.mock("morgan", () => () => (req, res, next) => next());

const request = require("supertest");
const { pool } = require("../../src/db");
const router = require("../../src/routes/examenes");
const {
  cargarApp,
  bearer,
  rows,
  vacio,
  roles,
  handlerDe,
  resMock,
  AUTH_INVALIDAS,
} = require("../helpers/app");

let app;
beforeAll(() => {
  app = cargarApp();
});
beforeEach(() => pool.query.mockReset());

const q = pool.query;
const MEDICO = bearer({ usuarioId: 2 });
const PACIENTE = bearer({ usuarioId: 7 });
const SIN_ID = bearer({ usuarioId: 0 });
const conAuth = (req, h) => (h ? req.set("Authorization", h) : req);
const examen = { tipo_examen_medico_id: 1, paciente_id: 11 };

describe("CP-04.A Crear examen (POST /examenes)", () => {
  test("CP-04.1 médico crea examen con diagnóstico y tratamiento", async () => {
    q.mockResolvedValueOnce(roles("medico"))
      .mockResolvedValueOnce(rows({ id: 30, ...examen }))
      .mockResolvedValueOnce(vacio());
    const res = await request(app)
      .post("/examenes")
      .set("Authorization", MEDICO)
      .send({ ...examen, diagnosis: "Sano", tratamiento: "Nada", observaciones: "Ok", notas: "N" });
    expect(res.status).toBe(201);
    expect(q.mock.calls[1][1]).toEqual([1, 11, "Sano", "Nada", "Ok", "N"]);
    expect(q.mock.calls[2][1][1]).toBe("EXAMENES_CREAR: creó examen médico ID 30 para paciente ID 11");
  });

  test("CP-04.2 campos clínicos vacíos se guardan como NULL", async () => {
    q.mockResolvedValueOnce(roles("admin"))
      .mockResolvedValueOnce(rows({ id: 31 }))
      .mockResolvedValueOnce(vacio());
    await request(app).post("/examenes").set("Authorization", SIN_ID).send(examen);
    expect(q.mock.calls[1][1]).toEqual([1, 11, null, null, null, null]);
    expect(q.mock.calls[2][1][0]).toBeNull();
  });

  test("CP-04.3 sin token responde 401", async () => {
    const res = await request(app).post("/examenes").send(examen);
    expect(res.status).toBe(401);
  });

  test("CP-04.4 paciente no puede crear exámenes (403)", async () => {
    q.mockResolvedValueOnce(roles("paciente"));
    const res = await request(app).post("/examenes").set("Authorization", PACIENTE).send(examen);
    expect(res.status).toBe(403);
  });

  test("NF-02.18 falla al consultar roles responde 500", async () => {
    q.mockRejectedValueOnce(new Error("roles"));
    const res = await request(app).post("/examenes").set("Authorization", MEDICO).send(examen);
    expect(res.status).toBe(500);
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.19 error de BD al crear responde 500 (%p)", async (err, glosa) => {
    q.mockResolvedValueOnce(roles("medico")).mockRejectedValueOnce(err);
    const res = await request(app).post("/examenes").set("Authorization", MEDICO).send(examen);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe(glosa);
  });

  test("CP-04.5 sin tipo de examen responde 400", async () => {
    const res = await request(app)
      .post("/examenes")
      .set("Authorization", MEDICO)
      .send({ paciente_id: 1 });
    expect(res.status).toBe(400);
  });
});

describe("CP-04.B Listar exámenes (GET /examenes)", () => {
  test.each(AUTH_INVALIDAS)("CP-04.6 rechaza %s con 401", async (_d, h) => {
    const res = await conAuth(request(app).get("/examenes"), h);
    expect(res.status).toBe(401);
  });

  test("CP-04.7 rol sin permisos recibe 403", async () => {
    q.mockResolvedValueOnce(roles("otro"));
    const res = await request(app).get("/examenes").set("Authorization", MEDICO);
    expect(res.status).toBe(403);
  });

  test("CP-04.10 médico ve todos los exámenes", async () => {
    q.mockResolvedValueOnce(roles("medico")).mockResolvedValueOnce(rows({ id: 1 }, { id: 2 }));
    const res = await request(app).get("/examenes").set("Authorization", MEDICO);
    expect(res.body).toHaveLength(2);
    expect(q.mock.calls[1][0]).not.toMatch(/WHERE/);
  });

  test("CP-04.11 paciente con rol mixto (paciente+admin) ve todos", async () => {
    q.mockResolvedValueOnce(roles("paciente", "admin")).mockResolvedValueOnce(rows());
    const res = await request(app).get("/examenes").set("Authorization", MEDICO);
    expect(res.status).toBe(200);
  });

  test("CP-04.12 paciente solo ve sus exámenes", async () => {
    q.mockResolvedValueOnce(roles("paciente"))
      .mockResolvedValueOnce(rows({ id: 11 }))
      .mockResolvedValueOnce(rows({ id: 5 }));
    const res = await request(app).get("/examenes").set("Authorization", PACIENTE);
    expect(res.status).toBe(200);
    expect(q.mock.calls[2][0]).toMatch(/WHERE em.paciente_id = \$1/);
    expect(q.mock.calls[2][1]).toEqual([11]);
  });

  test("CP-04.13 paciente sin ficha recibe 404", async () => {
    q.mockResolvedValueOnce(roles("paciente")).mockResolvedValueOnce(vacio());
    const res = await request(app).get("/examenes").set("Authorization", PACIENTE);
    expect(res.status).toBe(404);
  });

  test("CP-04.14 paciente+médico ve todos", async () => {
    q.mockResolvedValueOnce(roles("paciente", "medico")).mockResolvedValueOnce(rows());
    const res = await request(app).get("/examenes").set("Authorization", MEDICO);
    expect(res.status).toBe(200);
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.20 error de BD responde 500 (%p)", async (err, glosa) => {
    q.mockRejectedValueOnce(err);
    const res = await request(app).get("/examenes").set("Authorization", MEDICO);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe(glosa);
  });
});

describe("CP-04.C Detalle de examen (GET /examenes/:id)", () => {
  test.each(AUTH_INVALIDAS)("CP-04.15 rechaza %s con 401", async (_d, h) => {
    const res = await conAuth(request(app).get("/examenes/1"), h);
    expect(res.status).toBe(401);
  });

  test("CP-04.16 rol sin permisos recibe 403", async () => {
    q.mockResolvedValueOnce(roles());
    const res = await request(app).get("/examenes/1").set("Authorization", MEDICO);
    expect(res.status).toBe(403);
  });

  test("CP-04.17 médico obtiene el detalle", async () => {
    q.mockResolvedValueOnce(roles("medico")).mockResolvedValueOnce(rows({ id: 1 }));
    const res = await request(app).get("/examenes/1").set("Authorization", MEDICO);
    expect(res.body.id).toBe(1);
  });

  test("CP-04.18 examen inexistente responde 404", async () => {
    q.mockResolvedValueOnce(roles("admin")).mockResolvedValueOnce(vacio());
    const res = await request(app).get("/examenes/1").set("Authorization", MEDICO);
    expect(res.status).toBe(404);
  });

  test("CP-04.19 paciente solo obtiene exámenes propios", async () => {
    q.mockResolvedValueOnce(roles("paciente"))
      .mockResolvedValueOnce(rows({ id: 11 }))
      .mockResolvedValueOnce(rows({ id: 1 }));
    const res = await request(app).get("/examenes/1").set("Authorization", PACIENTE);
    expect(res.status).toBe(200);
    expect(q.mock.calls[2][1]).toEqual(["1", 11]);
  });

  test("CP-04.20 paciente sin ficha recibe 404", async () => {
    q.mockResolvedValueOnce(roles("paciente")).mockResolvedValueOnce(vacio());
    const res = await request(app).get("/examenes/1").set("Authorization", PACIENTE);
    expect(res.status).toBe(404);
  });

  test("CP-04.21 roles mixtos con médico o admin no filtran por paciente", async () => {
    q.mockResolvedValueOnce(roles("paciente", "medico")).mockResolvedValueOnce(rows({ id: 1 }));
    await request(app).get("/examenes/1").set("Authorization", MEDICO);
    q.mockResolvedValueOnce(roles("paciente", "admin")).mockResolvedValueOnce(rows({ id: 1 }));
    const res = await request(app).get("/examenes/1").set("Authorization", MEDICO);
    expect(res.status).toBe(200);
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.21 error de BD responde 500 (%p)", async (err, glosa) => {
    q.mockRejectedValueOnce(err);
    const res = await request(app).get("/examenes/1").set("Authorization", MEDICO);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe(glosa);
  });
});

describe("CP-04.D Exámenes por paciente (GET /examenes/paciente/:id)", () => {
  test.each(AUTH_INVALIDAS)("CP-04.22 rechaza %s con 401", async (_d, h) => {
    const res = await conAuth(request(app).get("/examenes/paciente/11"), h);
    expect(res.status).toBe(401);
  });

  test("CP-04.23 paciente ve sus exámenes", async () => {
    q.mockResolvedValueOnce(roles("paciente"))
      .mockResolvedValueOnce(rows({ id: 11 }))
      .mockResolvedValueOnce(rows({ id: 1 }));
    const res = await request(app).get("/examenes/paciente/11").set("Authorization", PACIENTE);
    expect(res.status).toBe(200);
  });

  test("CP-04.24 paciente no ve exámenes de otro paciente (403)", async () => {
    q.mockResolvedValueOnce(roles("paciente")).mockResolvedValueOnce(rows({ id: 11 }));
    const res = await request(app).get("/examenes/paciente/12").set("Authorization", PACIENTE);
    expect(res.status).toBe(403);
  });

  test("CP-04.25 paciente sin ficha recibe 403", async () => {
    q.mockResolvedValueOnce(roles("paciente")).mockResolvedValueOnce(vacio());
    const res = await request(app).get("/examenes/paciente/11").set("Authorization", PACIENTE);
    expect(res.status).toBe(403);
  });

  test("CP-04.26 rol sin permisos recibe 403", async () => {
    q.mockResolvedValueOnce(roles("otro"));
    const res = await request(app).get("/examenes/paciente/11").set("Authorization", MEDICO);
    expect(res.status).toBe(403);
  });

  test.each([["medico"], ["admin"]])("CP-04.27 %s ve exámenes de cualquier paciente", async (rol) => {
    q.mockResolvedValueOnce(roles(rol)).mockResolvedValueOnce(rows({ id: 1 }));
    const res = await request(app).get("/examenes/paciente/11").set("Authorization", MEDICO);
    expect(res.status).toBe(200);
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.22 error de BD responde 500 (%p)", async (err, glosa) => {
    q.mockRejectedValueOnce(err);
    const res = await request(app).get("/examenes/paciente/11").set("Authorization", MEDICO);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe(glosa);
  });
});

describe("CP-04.E Actualizar examen (PUT /examenes/:id)", () => {
  test("CP-04.28 médico actualiza diagnóstico y notas", async () => {
    q.mockResolvedValueOnce(roles("medico"))
      .mockResolvedValueOnce(rows({ id: 1 }))
      .mockResolvedValueOnce(vacio());
    const res = await request(app)
      .put("/examenes/1")
      .set("Authorization", MEDICO)
      .send({ diagnosis: "Control", notas: "Revisar" });
    expect(res.status).toBe(200);
    expect(q.mock.calls[1][0]).toMatch(/SET diagnosis=\$1, notas=\$2 WHERE id=\$3/);
  });

  test("CP-04.29 sin token responde 401 y paciente recibe 403", async () => {
    expect((await request(app).put("/examenes/1").send({ notas: "x" })).status).toBe(401);
    q.mockResolvedValueOnce(roles("paciente"));
    const res = await request(app).put("/examenes/1").set("Authorization", PACIENTE).send({ notas: "x" });
    expect(res.status).toBe(403);
  });

  test("CP-04.30 examen inexistente responde 404", async () => {
    q.mockResolvedValueOnce(roles("medico")).mockResolvedValueOnce(vacio());
    const res = await request(app).put("/examenes/9").set("Authorization", MEDICO).send({ notas: "x" });
    expect(res.status).toBe(404);
  });

  test("CP-04.31 auditoría registra NULL si el token no trae usuarioId", async () => {
    q.mockResolvedValueOnce(roles("medico"))
      .mockResolvedValueOnce(rows({ id: 1 }))
      .mockResolvedValueOnce(vacio());
    await request(app).put("/examenes/1").set("Authorization", SIN_ID).send({ notas: "x" });
    expect(q.mock.calls[2][1][0]).toBeNull();
  });

  test("CP-04.32 sin campos para actualizar responde 400 (handler directo)", async () => {
    q.mockResolvedValueOnce(roles("medico"));
    const res = resMock();
    await handlerDe(router, "put", "/:id")(
      { headers: { authorization: MEDICO }, params: { id: "1" }, body: {} },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.23 error de BD responde 500 (%p)", async (err, glosa) => {
    q.mockResolvedValueOnce(roles("medico")).mockRejectedValueOnce(err);
    const res = await request(app).put("/examenes/1").set("Authorization", MEDICO).send({ notas: "x" });
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe(glosa);
  });
});

describe("CP-04.F Eliminar examen (DELETE /examenes/:id)", () => {
  test("CP-04.33 admin elimina examen", async () => {
    q.mockResolvedValueOnce(roles("admin"))
      .mockResolvedValueOnce(rows({ id: 1 }))
      .mockResolvedValueOnce(vacio());
    const res = await request(app).delete("/examenes/1").set("Authorization", MEDICO);
    expect(res.body).toEqual({ deleted: true });
  });

  test("CP-04.34 médico no puede eliminar (403)", async () => {
    q.mockResolvedValueOnce(roles("medico"));
    const res = await request(app).delete("/examenes/1").set("Authorization", MEDICO);
    expect(res.status).toBe(403);
  });

  test("CP-04.35 examen inexistente responde 404", async () => {
    q.mockResolvedValueOnce(roles("admin")).mockResolvedValueOnce(vacio());
    const res = await request(app).delete("/examenes/1").set("Authorization", MEDICO);
    expect(res.status).toBe(404);
  });

  test("CP-04.36 auditoría registra NULL si el token no trae usuarioId", async () => {
    q.mockResolvedValueOnce(roles("admin"))
      .mockResolvedValueOnce(rows({ id: 1 }))
      .mockResolvedValueOnce(vacio());
    await request(app).delete("/examenes/1").set("Authorization", SIN_ID);
    expect(q.mock.calls[2][1][0]).toBeNull();
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.24 error de BD responde 500 (%p)", async (err, glosa) => {
    q.mockResolvedValueOnce(roles("admin")).mockRejectedValueOnce(err);
    const res = await request(app).delete("/examenes/1").set("Authorization", MEDICO);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe(glosa);
  });
});
