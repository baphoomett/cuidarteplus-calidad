/**
 * CP-03 Gestión de pacientes (/pacientes)
 */
jest.mock("../../src/db", () => ({ pool: { query: jest.fn() } }));
jest.mock("../../src/middleware/delay", () => () => (req, res, next) => next());
jest.mock("morgan", () => () => (req, res, next) => next());

const request = require("supertest");
const { pool } = require("../../src/db");
const router = require("../../src/routes/pacientes");
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
const MEDICO = bearer({ usuarioId: 2, nombreUsuario: "medico" });
const PACIENTE = bearer({ usuarioId: 7, nombreUsuario: "paciente" });
const SIN_ID = bearer({ usuarioId: 0 });

const pacienteMinimo = {
  rut: "12.345.678-5",
  primer_nombre: "Ana",
  apellido_paterno: "Pérez",
  fecha_nacimiento: "1990-05-10",
  sexo: "F",
  email: "ana@correo.cl",
};
const pacienteCompleto = {
  ...pacienteMinimo,
  apellido_materno: "Soto",
  nacionalidad: "Chilena",
  estado_civil: "casado",
  telefono: "+56911112222",
  direccion: "Av. Siempre Viva 123",
  contacto_emergencia_nombre: "Luis",
  contacto_emergencia_telefono: "+56933334444",
  contacto_emergencia_relacion: "Hermano",
  tipo_prevision: "FONASA",
  tiene_convenio: true,
  grupo_sanguineo: "O+",
  alergias: "Penicilina",
  enfermedades_cronicas: "Asma",
  discapacidades: "Ninguna",
  observaciones_medicas_generales: "Control anual",
  usuario_id: 7,
};

const conAuth = (req, h) => (h ? req.set("Authorization", h) : req);

describe("CP-03 Gestión de pacientes - control de acceso común", () => {
  test.each(AUTH_INVALIDAS)("CP-03.9 GET /pacientes/:id rechaza %s con 401", async (_d, h) => {
    const res = await conAuth(request(app).get("/pacientes/1"), h);
    expect(res.status).toBe(401);
  });

  test("CP-03.10 POST sin token responde 401", async () => {
    const res = await request(app).post("/pacientes").send(pacienteMinimo);
    expect(res.status).toBe(401);
  });

  test("CP-03.11 rol sin permiso (sin roles) responde 403", async () => {
    q.mockResolvedValueOnce(roles());
    const res = await request(app).get("/pacientes").set("Authorization", MEDICO);
    expect(res.status).toBe(403);
  });

  test("NF-02.11 falla al consultar roles responde 500", async () => {
    q.mockRejectedValueOnce(new Error("roles"));
    const res = await request(app).delete("/pacientes/1").set("Authorization", MEDICO);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Error al verificar roles");
  });
});

describe("CP-03.A Crear paciente (POST /pacientes)", () => {
  test("CP-03.1 médico registra paciente con todos los campos", async () => {
    q.mockResolvedValueOnce(roles("medico"))
      .mockResolvedValueOnce(rows({ id: 50, ...pacienteCompleto }))
      .mockResolvedValueOnce(vacio());
    const res = await request(app)
      .post("/pacientes")
      .set("Authorization", MEDICO)
      .send(pacienteCompleto);
    expect(res.status).toBe(201);
    const valores = q.mock.calls[1][1];
    expect(valores[0]).toBe("12345678-5");
    expect(valores[15]).toBe(true);
    expect(q.mock.calls[2][1][0]).toBe(2);
  });

  test("CP-03.2 campos opcionales vacíos se guardan como NULL", async () => {
    q.mockResolvedValueOnce(roles("admin"))
      .mockResolvedValueOnce(rows({ id: 51 }))
      .mockResolvedValueOnce(vacio());
    const res = await request(app)
      .post("/pacientes")
      .set("Authorization", SIN_ID)
      .send(pacienteMinimo);
    expect(res.status).toBe(201);
    const valores = q.mock.calls[1][1];
    expect(valores[3]).toBeNull();
    expect(valores[15]).toBe(false);
    expect(valores[21]).toBeNull();
    expect(q.mock.calls[2][1][0]).toBeNull();
  });

  test("CP-03.3 RUT o email duplicado responde 400", async () => {
    q.mockResolvedValueOnce(roles("medico")).mockRejectedValueOnce({ code: "23505" });
    const res = await request(app)
      .post("/pacientes")
      .set("Authorization", MEDICO)
      .send(pacienteMinimo);
    expect(res.status).toBe(400);
    expect(res.body.glosa).toBe("El RUT o email ya existe");
  });

  test.each([
    [new Error("insert"), "insert"],
    ["texto", "texto"],
  ])("NF-02.12 error de BD al crear responde 500 (%p)", async (err) => {
    q.mockResolvedValueOnce(roles("medico")).mockRejectedValueOnce(err);
    const res = await request(app)
      .post("/pacientes")
      .set("Authorization", MEDICO)
      .send(pacienteMinimo);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe("Error interno del servidor");
  });

  test("CP-03.4 datos inválidos responden 400 con detalle", async () => {
    const res = await request(app)
      .post("/pacientes")
      .set("Authorization", MEDICO)
      .send({ ...pacienteMinimo, sexo: "X" });
    expect(res.status).toBe(400);
    expect(res.body.detalles[0].field).toBe("sexo");
  });
});

describe("CP-03.B Listar pacientes (GET /pacientes)", () => {
  test("CP-03.5 médico obtiene el listado", async () => {
    q.mockResolvedValueOnce(roles("medico")).mockResolvedValueOnce(rows({ id: 1 }, { id: 2 }));
    const res = await request(app).get("/pacientes").set("Authorization", MEDICO);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test("CP-03.12 sin token responde 401", async () => {
    const res = await request(app).get("/pacientes");
    expect(res.status).toBe(401);
  });

  test.each([
    [new Error("select"), "select"],
    ["texto", "texto"],
  ])("NF-02.13 error de BD al listar responde 500 (%p)", async (err) => {
    q.mockResolvedValueOnce(roles("admin")).mockRejectedValueOnce(err);
    const res = await request(app).get("/pacientes").set("Authorization", MEDICO);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe("Error interno del servidor");
  });
});

describe("CP-03.C Obtener paciente (GET /pacientes/:id)", () => {
  test("CP-03.6 médico obtiene cualquier ficha", async () => {
    q.mockResolvedValueOnce(roles("medico")).mockResolvedValueOnce(rows({ id: 4 }));
    const res = await request(app).get("/pacientes/4").set("Authorization", MEDICO);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(4);
  });

  test("CP-03.13 admin recibe 404 si la ficha no existe", async () => {
    q.mockResolvedValueOnce(roles("admin")).mockResolvedValueOnce(vacio());
    const res = await request(app).get("/pacientes/999").set("Authorization", MEDICO);
    expect(res.status).toBe(404);
  });

  test("CP-03.14 paciente obtiene su propia ficha", async () => {
    q.mockResolvedValueOnce(roles("paciente"))
      .mockResolvedValueOnce(rows({ id: 11 }))
      .mockResolvedValueOnce(rows({ id: 11, primer_nombre: "Ana" }));
    const res = await request(app).get("/pacientes/11").set("Authorization", PACIENTE);
    expect(res.status).toBe(200);
  });

  test("CP-03.15 paciente no puede ver la ficha de otro (403)", async () => {
    q.mockResolvedValueOnce(roles("paciente")).mockResolvedValueOnce(rows({ id: 11 }));
    const res = await request(app).get("/pacientes/12").set("Authorization", PACIENTE);
    expect(res.status).toBe(403);
  });

  test("CP-03.16 paciente sin ficha asociada recibe 404", async () => {
    q.mockResolvedValueOnce(roles("paciente")).mockResolvedValueOnce(vacio());
    const res = await request(app).get("/pacientes/11").set("Authorization", PACIENTE);
    expect(res.status).toBe(404);
  });

  test("CP-03.17 usuario sin rol clínico recibe 403", async () => {
    q.mockResolvedValueOnce(roles("otro"));
    const res = await request(app).get("/pacientes/11").set("Authorization", PACIENTE);
    expect(res.status).toBe(403);
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.14 error de BD responde 500 (%p)", async (err) => {
    q.mockRejectedValueOnce(err);
    const res = await request(app).get("/pacientes/1").set("Authorization", MEDICO);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe("Error interno del servidor");
  });
});

describe("CP-03.D Buscar paciente por RUT (GET /pacientes/buscar/rut/:rut)", () => {
  test("CP-03.18 encuentra la ficha normalizando el RUT", async () => {
    q.mockResolvedValueOnce(roles("medico")).mockResolvedValueOnce(rows({ id: 3, rut: "12345678-5" }));
    const res = await request(app)
      .get("/pacientes/buscar/rut/12.345.678-5")
      .set("Authorization", MEDICO);
    expect(res.status).toBe(200);
    expect(q.mock.calls[1][1]).toEqual(["12345678-5"]);
  });

  test("CP-03.19 RUT inexistente responde 404", async () => {
    q.mockResolvedValueOnce(roles("medico")).mockResolvedValueOnce(vacio());
    const res = await request(app)
      .get("/pacientes/buscar/rut/1-9")
      .set("Authorization", MEDICO);
    expect(res.status).toBe(404);
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.15 error de BD responde 500 (%p)", async (err) => {
    q.mockResolvedValueOnce(roles("medico")).mockRejectedValueOnce(err);
    const res = await request(app)
      .get("/pacientes/buscar/rut/1-9")
      .set("Authorization", MEDICO);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe("Error interno del servidor");
  });
});

describe("CP-03.E Actualizar paciente (PUT /pacientes/:id)", () => {
  test.each(AUTH_INVALIDAS)("CP-03.20 rechaza %s con 401", async (_d, h) => {
    const res = await conAuth(request(app).put("/pacientes/1").send({ telefono: "1" }), h);
    expect(res.status).toBe(401);
  });

  test("CP-03.21 médico actualiza y el RUT se normaliza", async () => {
    q.mockResolvedValueOnce(roles("medico"))
      .mockResolvedValueOnce(rows({ id: 4, telefono: "2" }))
      .mockResolvedValueOnce(vacio());
    const res = await request(app)
      .put("/pacientes/4")
      .set("Authorization", MEDICO)
      .send({ rut: "11.111.111-1", telefono: "2" });
    expect(res.status).toBe(200);
    expect(q.mock.calls[1][0]).toMatch(/UPDATE pacientes SET rut=\$1, telefono=\$2 WHERE id=\$3/);
    expect(q.mock.calls[1][1]).toEqual(["11111111-1", "2", "4"]);
  });

  test("CP-03.22 paciente actualiza su propia ficha", async () => {
    q.mockResolvedValueOnce(roles("paciente"))
      .mockResolvedValueOnce(rows({ id: 11 }))
      .mockResolvedValueOnce(rows({ id: 11 }))
      .mockResolvedValueOnce(vacio());
    const res = await request(app)
      .put("/pacientes/11")
      .set("Authorization", PACIENTE)
      .send({ telefono: "3" });
    expect(res.status).toBe(200);
  });

  test("CP-03.23 paciente no puede actualizar otra ficha (403)", async () => {
    q.mockResolvedValueOnce(roles("paciente")).mockResolvedValueOnce(rows({ id: 11 }));
    const res = await request(app)
      .put("/pacientes/12")
      .set("Authorization", PACIENTE)
      .send({ telefono: "3" });
    expect(res.status).toBe(403);
  });

  test("CP-03.24 paciente sin ficha recibe 404", async () => {
    q.mockResolvedValueOnce(roles("paciente")).mockResolvedValueOnce(vacio());
    const res = await request(app)
      .put("/pacientes/11")
      .set("Authorization", PACIENTE)
      .send({ telefono: "3" });
    expect(res.status).toBe(404);
  });

  test("CP-03.25 usuario sin rol clínico recibe 403", async () => {
    q.mockResolvedValueOnce(roles());
    const res = await request(app)
      .put("/pacientes/11")
      .set("Authorization", PACIENTE)
      .send({ telefono: "3" });
    expect(res.status).toBe(403);
  });

  test("CP-03.26 ficha inexistente responde 404 (auditoría sin ID de usuario)", async () => {
    q.mockResolvedValueOnce(roles("admin")).mockResolvedValueOnce(vacio());
    const res = await request(app)
      .put("/pacientes/999")
      .set("Authorization", SIN_ID)
      .send({ telefono: "3" });
    expect(res.status).toBe(404);
  });

  test("CP-03.27 auditoría registra NULL si el token no trae usuarioId", async () => {
    q.mockResolvedValueOnce(roles("admin"))
      .mockResolvedValueOnce(rows({ id: 9 }))
      .mockResolvedValueOnce(vacio());
    await request(app).put("/pacientes/9").set("Authorization", SIN_ID).send({ telefono: "3" });
    expect(q.mock.calls[2][1][0]).toBeNull();
  });

  test("CP-03.28 sin campos para actualizar responde 400 (handler directo)", async () => {
    q.mockResolvedValueOnce(roles("medico"));
    const res = resMock();
    await handlerDe(router, "put", "/:id")(
      { headers: { authorization: MEDICO }, params: { id: "4" }, body: {} },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.16 error de BD responde 500 (%p)", async (err) => {
    q.mockRejectedValueOnce(err);
    const res = await request(app)
      .put("/pacientes/4")
      .set("Authorization", MEDICO)
      .send({ telefono: "3" });
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe("Error interno del servidor");
  });
});

describe("CP-03.F Eliminar paciente (DELETE /pacientes/:id)", () => {
  test("CP-03.29 admin elimina la ficha", async () => {
    q.mockResolvedValueOnce(roles("admin"))
      .mockResolvedValueOnce(rows({ id: 4 }))
      .mockResolvedValueOnce(vacio());
    const res = await request(app).delete("/pacientes/4").set("Authorization", MEDICO);
    expect(res.body).toEqual({ deleted: true });
    expect(q.mock.calls[2][1][0]).toBe(2);
  });

  test("CP-03.30 médico no puede eliminar (403)", async () => {
    q.mockResolvedValueOnce(roles("medico"));
    const res = await request(app).delete("/pacientes/4").set("Authorization", MEDICO);
    expect(res.status).toBe(403);
  });

  test("CP-03.31 ficha inexistente responde 404", async () => {
    q.mockResolvedValueOnce(roles("admin")).mockResolvedValueOnce(vacio());
    const res = await request(app).delete("/pacientes/4").set("Authorization", MEDICO);
    expect(res.status).toBe(404);
  });

  test("CP-03.32 auditoría registra NULL si el token no trae usuarioId", async () => {
    q.mockResolvedValueOnce(roles("admin"))
      .mockResolvedValueOnce(rows({ id: 4 }))
      .mockResolvedValueOnce(vacio());
    await request(app).delete("/pacientes/4").set("Authorization", SIN_ID);
    expect(q.mock.calls[2][1][0]).toBeNull();
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.17 error de BD responde 500 (%p)", async (err) => {
    q.mockResolvedValueOnce(roles("admin")).mockRejectedValueOnce(err);
    const res = await request(app).delete("/pacientes/4").set("Authorization", MEDICO);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe("Error interno del servidor");
  });
});
