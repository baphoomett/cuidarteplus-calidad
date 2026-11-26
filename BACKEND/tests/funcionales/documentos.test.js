/**
 * CP-05 Documentos de exámenes (/documentos)
 */
jest.mock("../../src/db", () => ({ pool: { query: jest.fn() } }));
jest.mock("../../src/middleware/delay", () => () => (req, res, next) => next());
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
const MEDICO = bearer({ usuarioId: 2 });
const PACIENTE = bearer({ usuarioId: 7 });
const SIN_ID = bearer({ usuarioId: 0 });
const conAuth = (req, h) => (h ? req.set("Authorization", h) : req);
const PDF = Buffer.from("%PDF-1.4 prueba");

function subir(auth, campos = { examen_medico_id: "1", paciente_id: "11" }, archivo = true) {
  let r = request(app).post("/documentos");
  if (auth) r = r.set("Authorization", auth);
  for (const [k, v] of Object.entries(campos)) r = r.field(k, v);
  if (archivo) r = r.attach("documento", PDF, { filename: "resultado.pdf", contentType: "application/pdf" });
  return r;
}

describe("CP-05.A Subir documento (POST /documentos)", () => {
  test("CP-05.1 médico sube un PDF asociado al examen", async () => {
    q.mockResolvedValueOnce(roles("medico"))
      .mockResolvedValueOnce(rows({ id: 9, nombre_archivo: "resultado.pdf" }))
      .mockResolvedValueOnce(vacio());
    const res = await subir(MEDICO);
    expect(res.status).toBe(201);
    expect(res.body.documento.nombre_archivo).toBe("resultado.pdf");
    expect(q.mock.calls[1][1][2]).toEqual(PDF);
    expect(q.mock.calls[2][1][1]).toMatch(/DOCUMENTOS_CREAR/);
  });

  test("CP-05.2 acepta imágenes JPG y PNG", async () => {
    for (const [nombre, tipo] of [["a.jpg", "image/jpeg"], ["b.png", "image/png"]]) {
      q.mockResolvedValueOnce(roles("admin"))
        .mockResolvedValueOnce(rows({ id: 1, nombre_archivo: nombre }))
        .mockResolvedValueOnce(vacio());
      const res = await request(app)
        .post("/documentos")
        .set("Authorization", SIN_ID)
        .field("examen_medico_id", "1")
        .field("paciente_id", "11")
        .attach(
          "documento",
          tipo === "image/png"
            ? Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
            : Buffer.from([0xff, 0xd8, 0xff, 0x00]),
          { filename: nombre, contentType: tipo }
        );
      expect(res.status).toBe(201);
    }
    expect(q.mock.calls[2][1][0]).toBeNull();
  });

  test("CP-05.3 rechaza tipos de archivo no permitidos", async () => {
    q.mockResolvedValueOnce(roles("medico"));
    const res = await request(app)
      .post("/documentos")
      .set("Authorization", MEDICO)
      .field("examen_medico_id", "1")
      .field("paciente_id", "11")
      .attach("documento", Buffer.from("MZ"), { filename: "virus.exe", contentType: "application/x-msdownload" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Archivo inválido");
    expect(q.mock.calls.some(([sql]) => /INSERT INTO documentos_examen/.test(sql))).toBe(false);
  });

  test("CP-05.4 sin token responde 401 y paciente recibe 403", async () => {
    expect((await subir(undefined)).status).toBe(401);
    q.mockResolvedValueOnce(roles("paciente"));
    expect((await subir(PACIENTE)).status).toBe(403);
  });

  test("CP-05.5 exige examen_medico_id y paciente_id", async () => {
    q.mockResolvedValueOnce(roles("medico"));
    expect((await subir(MEDICO, { paciente_id: "11" })).status).toBe(400);
    q.mockResolvedValueOnce(roles("medico"));
    expect((await subir(MEDICO, { examen_medico_id: "1" })).status).toBe(400);
  });

  test("CP-05.6 exige adjuntar un documento", async () => {
    q.mockResolvedValueOnce(roles("medico"));
    const res = await subir(MEDICO, undefined, false);
    expect(res.status).toBe(400);
    expect(res.body.glosa).toBe("Debe subir un documento");
  });

  test("NF-02.25 falla al consultar roles responde 500", async () => {
    q.mockRejectedValueOnce(new Error("roles"));
    expect((await subir(MEDICO)).status).toBe(500);
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.26 error de BD al guardar responde 500 (%p)", async (err) => {
    q.mockResolvedValueOnce(roles("medico")).mockRejectedValueOnce(err);
    const res = await subir(MEDICO);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe("Error interno del servidor");
  });
});

describe("CP-05.B Listar documentos de un examen (GET /documentos/examen/:id)", () => {
  test.each(AUTH_INVALIDAS)("CP-05.7 rechaza %s con 401", async (_d, h) => {
    const res = await conAuth(request(app).get("/documentos/examen/1"), h);
    expect(res.status).toBe(401);
  });

  test.each([["medico"], ["admin"]])("CP-05.8 %s lista documentos", async (rol) => {
    q.mockResolvedValueOnce(roles(rol)).mockResolvedValueOnce(rows({ id: 1 }));
    const res = await request(app).get("/documentos/examen/1").set("Authorization", MEDICO);
    expect(res.body).toEqual([{ id: 1 }]);
  });

  test("CP-05.9 paciente lista documentos de su examen", async () => {
    q.mockResolvedValueOnce(roles("paciente"))
      .mockResolvedValueOnce(rows({ paciente_id: 11, usuario_id: 7 }))
      .mockResolvedValueOnce(rows({ id: 1 }));
    const res = await request(app).get("/documentos/examen/1").set("Authorization", PACIENTE);
    expect(res.status).toBe(200);
  });

  test("CP-05.10 paciente no lista documentos ajenos o inexistentes (403)", async () => {
    q.mockResolvedValueOnce(roles("paciente")).mockResolvedValueOnce(rows({ usuario_id: 99 }));
    expect((await request(app).get("/documentos/examen/1").set("Authorization", PACIENTE)).status).toBe(403);
    q.mockResolvedValueOnce(roles("paciente")).mockResolvedValueOnce(vacio());
    expect((await request(app).get("/documentos/examen/1").set("Authorization", PACIENTE)).status).toBe(403);
  });

  test("CP-05.11 rol sin permisos recibe 403", async () => {
    q.mockResolvedValueOnce(roles());
    const res = await request(app).get("/documentos/examen/1").set("Authorization", MEDICO);
    expect(res.status).toBe(403);
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.27 error de BD responde 500 (%p)", async (err) => {
    q.mockRejectedValueOnce(err);
    const res = await request(app).get("/documentos/examen/1").set("Authorization", MEDICO);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe("Error interno del servidor");
  });
});

describe("CP-05.C Descargar documento (GET /documentos/:id)", () => {
  const doc = (nombre, usuario_id = 7) => rows({ id: 1, nombre_archivo: nombre, usuario_id, documento: Buffer.from("data") });

  test.each(AUTH_INVALIDAS)("CP-05.12 rechaza %s con 401", async (_d, h) => {
    const res = await conAuth(request(app).get("/documentos/1"), h);
    expect(res.status).toBe(401);
  });

  test.each([
    ["informe.pdf", "application/pdf"],
    ["foto.JPG", "image/jpeg"],
    ["foto.jpeg", "image/jpeg"],
    ["scan.png", "image/png"],
    ["sin_extension", "application/pdf"],
  ])("CP-05.13 %s se entrega como %s", async (nombre, tipo) => {
    q.mockResolvedValueOnce(roles("medico")).mockResolvedValueOnce(doc(nombre));
    const res = await request(app).get("/documentos/1").set("Authorization", MEDICO);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain(tipo);
    expect(res.headers["content-disposition"]).toBe(`attachment; filename="${nombre}"`);
  });

  test("CP-05.14 paciente descarga su documento", async () => {
    q.mockResolvedValueOnce(roles("paciente")).mockResolvedValueOnce(doc("a.pdf", 7));
    const res = await request(app).get("/documentos/1").set("Authorization", PACIENTE);
    expect(res.status).toBe(200);
  });

  test("CP-05.15 paciente no descarga documentos ajenos (403)", async () => {
    q.mockResolvedValueOnce(roles("paciente")).mockResolvedValueOnce(doc("a.pdf", 99));
    const res = await request(app).get("/documentos/1").set("Authorization", PACIENTE);
    expect(res.status).toBe(403);
  });

  test("CP-05.16 rol sin permisos recibe 403 y admin descarga", async () => {
    q.mockResolvedValueOnce(roles("otro")).mockResolvedValueOnce(doc("a.pdf"));
    expect((await request(app).get("/documentos/1").set("Authorization", MEDICO)).status).toBe(403);
    q.mockResolvedValueOnce(roles("admin")).mockResolvedValueOnce(doc("a.pdf"));
    expect((await request(app).get("/documentos/1").set("Authorization", MEDICO)).status).toBe(200);
  });

  test("CP-05.17 documento inexistente responde 404", async () => {
    q.mockResolvedValueOnce(roles("medico")).mockResolvedValueOnce(vacio());
    const res = await request(app).get("/documentos/1").set("Authorization", MEDICO);
    expect(res.status).toBe(404);
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.28 error de BD responde 500 (%p)", async (err) => {
    q.mockRejectedValueOnce(err);
    const res = await request(app).get("/documentos/1").set("Authorization", MEDICO);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe("Error interno del servidor");
  });
});

describe("CP-05.D Eliminar documento (DELETE /documentos/:id)", () => {
  test("CP-05.18 admin elimina documento y queda auditado", async () => {
    q.mockResolvedValueOnce(roles("admin"))
      .mockResolvedValueOnce(rows({ id: 1 }))
      .mockResolvedValueOnce(vacio());
    const res = await request(app).delete("/documentos/1").set("Authorization", MEDICO);
    expect(res.body).toEqual({ deleted: true });
    expect(q.mock.calls[2][1]).toEqual([2, "DOCUMENTOS_ELIMINAR: eliminó documento ID 1"]);
  });

  test("CP-05.19 médico no puede eliminar (403) y sin token 401", async () => {
    q.mockResolvedValueOnce(roles("medico"));
    expect((await request(app).delete("/documentos/1").set("Authorization", MEDICO)).status).toBe(403);
    expect((await request(app).delete("/documentos/1")).status).toBe(401);
  });

  test("CP-05.20 documento inexistente responde 404", async () => {
    q.mockResolvedValueOnce(roles("admin")).mockResolvedValueOnce(vacio());
    expect((await request(app).delete("/documentos/1").set("Authorization", MEDICO)).status).toBe(404);
  });

  test("CP-05.21 auditoría registra NULL si el token no trae usuarioId", async () => {
    q.mockResolvedValueOnce(roles("admin"))
      .mockResolvedValueOnce(rows({ id: 1 }))
      .mockResolvedValueOnce(vacio());
    await request(app).delete("/documentos/1").set("Authorization", SIN_ID);
    expect(q.mock.calls[2][1][0]).toBeNull();
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.29 error de BD responde 500 (%p)", async (err) => {
    q.mockResolvedValueOnce(roles("admin")).mockRejectedValueOnce(err);
    const res = await request(app).delete("/documentos/1").set("Authorization", MEDICO);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe("Error interno del servidor");
  });
});
