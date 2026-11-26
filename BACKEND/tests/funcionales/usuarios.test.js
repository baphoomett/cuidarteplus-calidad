/**
 * CP-06 Gestión de usuarios (/usuarios)
 * Cubre las dos ramas del módulo: "sistema médico" (usuario_roles) y la lógica
 * heredada "empresa" (empresa_usuarios) que se activa si el token trae empresaId.
 */
jest.mock("../../src/db", () => ({ pool: { query: jest.fn() } }));
jest.mock("morgan", () => () => (req, res, next) => next());

const request = require("supertest");
const { pool } = require("../../src/db");
const router = require("../../src/routes/users");
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
const ADMIN = bearer({ usuarioId: 1, nombreUsuario: "admin" });
const MEDICO = bearer({ usuarioId: 2, nombreUsuario: "medico" });
const PACIENTE = bearer({ usuarioId: 7, nombreUsuario: "paciente" });
const SIN_ID = bearer({ usuarioId: 0 });
const EMPRESA = bearer({ usuarioId: 1, empresaId: 10 });
const EMPRESA_SIN_ID = bearer({ usuarioId: 0, empresaId: 10 });
const conAuth = (req, h) => (h ? req.set("Authorization", h) : req);
const nuevo = { nombre_usuario: "medico2", contrasena_hash: "M3dico$Seguro2026", correo: "m2@c.cl" };

describe("CP-06.A Crear usuario (POST /usuarios)", () => {
  test.each(AUTH_INVALIDAS)("CP-06.1 rechaza %s con 401", async (_d, h) => {
    const res = await conAuth(request(app).post("/usuarios").send(nuevo), h);
    expect(res.status).toBe(401);
  });

  test("CP-06.2 admin crea usuario con rol (usuario_roles)", async () => {
    q.mockResolvedValueOnce(roles("admin"))
      .mockResolvedValueOnce(rows({ id: 40, nombre_usuario: "medico2" }))
      .mockResolvedValueOnce(vacio())
      .mockResolvedValueOnce(vacio());
    const res = await request(app)
      .post("/usuarios")
      .set("Authorization", ADMIN)
      .send({ ...nuevo, rol_id: 2 });
    expect(res.status).toBe(201);
    expect(q.mock.calls[2][0]).toMatch(/INSERT INTO usuario_roles/);
    expect(q.mock.calls[3][1][1]).toBe("USUARIOS_CREAR: creó usuario medico2 con rol 2");
  });

  test("CP-06.3 admin crea usuario sin rol y no inserta relaciones", async () => {
    q.mockResolvedValueOnce(roles("admin"))
      .mockResolvedValueOnce(rows({ id: 41 }))
      .mockResolvedValueOnce(vacio());
    const res = await request(app).post("/usuarios").set("Authorization", ADMIN).send(nuevo);
    expect(res.status).toBe(201);
    expect(q).toHaveBeenCalledTimes(3);
    expect(q.mock.calls[2][1]).toEqual([1, "USUARIOS_CREAR: creó usuario medico2"]);
  });

  test("CP-06.4 token con empresa crea relación empresa_usuarios", async () => {
    q.mockResolvedValueOnce(rows({ rol_id: 1 }))
      .mockResolvedValueOnce(rows({ id: 42 }))
      .mockResolvedValueOnce(vacio())
      .mockResolvedValueOnce(vacio());
    await request(app).post("/usuarios").set("Authorization", EMPRESA).send({ ...nuevo, rol_id: 1 });
    expect(q.mock.calls[2][0]).toMatch(/INSERT INTO empresa_usuarios/);
    expect(q.mock.calls[2][1]).toEqual([10, 42, 1]);
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.30 error de BD responde 500 (%p)", async (err, glosa) => {
    q.mockRejectedValueOnce(err);
    const res = await request(app).post("/usuarios").set("Authorization", ADMIN).send(nuevo);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe(glosa);
  });
});

describe("CP-06.B Listar usuarios (GET /usuarios)", () => {
  test("CP-06.5 sin token responde 401", async () => {
    expect((await request(app).get("/usuarios")).status).toBe(401);
  });

  test.each([["admin"], ["administrador"]])("CP-06.6 rol %s lista usuarios", async (rol) => {
    q.mockResolvedValueOnce(roles(rol)).mockResolvedValueOnce(rows({ id: 1 }, { id: 2 }));
    const res = await request(app).get("/usuarios").set("Authorization", ADMIN);
    expect(res.body).toHaveLength(2);
  });

  test("CP-06.7 rol no administrador recibe 403", async () => {
    q.mockResolvedValueOnce(roles("medico"));
    expect((await request(app).get("/usuarios").set("Authorization", MEDICO)).status).toBe(403);
  });

  test.each([
    ["rol_id 1", { rol_id: 1, rol_nombre: null }, 200],
    ["nombre admin", { rol_id: 5, rol_nombre: "admin" }, 200],
    ["nombre administrador", { rol_id: 5, rol_nombre: "administrador" }, 200],
    ["rol no admin", { rol_id: 5, rol_nombre: "vendedor" }, 403],
  ])("CP-06.10 lógica empresa: %s", async (_d, fila, estado) => {
    q.mockResolvedValueOnce(rows(fila)).mockResolvedValueOnce(rows());
    const res = await request(app).get("/usuarios").set("Authorization", EMPRESA);
    expect(res.status).toBe(estado);
  });

  test("CP-06.11 lógica empresa: usuario sin relación recibe 403", async () => {
    q.mockResolvedValueOnce(vacio());
    expect((await request(app).get("/usuarios").set("Authorization", EMPRESA)).status).toBe(403);
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.31 error de BD responde 500 (%p)", async (err, glosa) => {
    q.mockRejectedValueOnce(err);
    const res = await request(app).get("/usuarios").set("Authorization", ADMIN);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe(glosa);
  });
});

describe("CP-06.C Obtener usuario (GET /usuarios/:id)", () => {
  test("CP-06.12 sin token responde 401", async () => {
    expect((await request(app).get("/usuarios/1")).status).toBe(401);
  });

  test.each([["admin"], ["medico"]])("CP-06.13 %s obtiene cualquier usuario", async (rol) => {
    q.mockResolvedValueOnce(roles(rol)).mockResolvedValueOnce(rows({ id: 5, rol_nombre: "paciente" }));
    const res = await request(app).get("/usuarios/5").set("Authorization", ADMIN);
    expect(res.body).toEqual({ id: 5, rol_nombre: "paciente", es_unico_administrador: false });
  });

  test("CP-06.14 paciente obtiene sus propios datos", async () => {
    q.mockResolvedValueOnce(roles("paciente")).mockResolvedValueOnce(rows({ id: 7 }));
    expect((await request(app).get("/usuarios/7").set("Authorization", PACIENTE)).status).toBe(200);
  });

  test("CP-06.15 paciente no obtiene datos de otro usuario (403)", async () => {
    q.mockResolvedValueOnce(roles("paciente"));
    expect((await request(app).get("/usuarios/1").set("Authorization", PACIENTE)).status).toBe(403);
  });

  test("CP-06.16 usuario inexistente responde 404", async () => {
    q.mockResolvedValueOnce(roles("admin")).mockResolvedValueOnce(vacio());
    expect((await request(app).get("/usuarios/99").set("Authorization", ADMIN)).status).toBe(404);
  });

  test.each([
    ["único administrador", { rol_id: 1 }, "1", true],
    ["varios administradores", { rol_id: 1 }, "3", false],
  ])("CP-06.17 lógica empresa: %s", async (_d, fila, cuenta, esperado) => {
    q.mockResolvedValueOnce(rows({ id: 1, ...fila })).mockResolvedValueOnce(rows({ count: cuenta }));
    const res = await request(app).get("/usuarios/1").set("Authorization", EMPRESA);
    expect(res.body.es_unico_administrador).toBe(esperado);
  });

  test("CP-06.18 lógica empresa: usuario no administrador y no encontrado", async () => {
    q.mockResolvedValueOnce(rows({ id: 2, rol_id: 2 }));
    const res = await request(app).get("/usuarios/2").set("Authorization", EMPRESA);
    expect(res.body.es_unico_administrador).toBe(false);
    q.mockResolvedValueOnce(vacio());
    expect((await request(app).get("/usuarios/3").set("Authorization", EMPRESA)).status).toBe(404);
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.32 error de BD responde 500 (%p)", async (err, glosa) => {
    q.mockRejectedValueOnce(err);
    const res = await request(app).get("/usuarios/1").set("Authorization", ADMIN);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe(glosa);
  });
});

describe("CP-06.D Actualizar usuario - sistema médico (PUT /usuarios/:id)", () => {
  test("CP-06.19 sin token responde 401", async () => {
    expect((await request(app).put("/usuarios/1").send({ correo: "a@b.cl" })).status).toBe(401);
  });

  test("CP-06.20 admin actualiza todos los campos y el rol de otro usuario", async () => {
    q.mockResolvedValueOnce(roles("admin"))
      .mockResolvedValueOnce(rows({ id: 5 }))
      .mockResolvedValueOnce(vacio())
      .mockResolvedValueOnce(vacio())
      .mockResolvedValueOnce(rows({ id: 5, rol_id: 2 }))
      .mockResolvedValueOnce(vacio());
    const res = await request(app)
      .put("/usuarios/5")
      .set("Authorization", ADMIN)
      .send({ nombre_usuario: "nuevo", contrasena_hash: "M3dico$Seguro2026", correo: "n@c.cl", rol_id: 2 });
    expect(res.status).toBe(200);
    expect(q.mock.calls[1][0]).toMatch(/SET nombre_usuario=\$1, contrasena=\$2, correo=\$3 WHERE id=\$4/);
    expect(q.mock.calls[2][0]).toMatch(/DELETE FROM usuario_roles/);
    expect(q.mock.calls[5][1][1]).toBe("USUARIOS_ACTUALIZAR: actualizó usuario ID 5 y rol a 2");
  });

  test("CP-06.21 paciente actualiza su correo", async () => {
    q.mockResolvedValueOnce(roles("paciente"))
      .mockResolvedValueOnce(rows({ id: 7 }))
      .mockResolvedValueOnce(rows({ id: 7 }))
      .mockResolvedValueOnce(vacio());
    const res = await request(app).put("/usuarios/7").set("Authorization", PACIENTE).send({ correo: "p@c.cl" });
    expect(res.status).toBe(200);
    expect(q.mock.calls[3][1][1]).toBe("USUARIOS_ACTUALIZAR: actualizó usuario ID 7");
  });

  test("CP-06.22 paciente no edita a otro usuario ni cambia su rol (403)", async () => {
    q.mockResolvedValueOnce(roles("paciente"));
    expect((await request(app).put("/usuarios/1").set("Authorization", PACIENTE).send({ correo: "x@c.cl" })).status).toBe(403);
    q.mockResolvedValueOnce(roles("paciente"));
    const res = await request(app)
      .put("/usuarios/7")
      .set("Authorization", PACIENTE)
      .send({ correo: "x@c.cl", rol_id: 1 });
    expect(res.status).toBe(403);
    expect(res.body.glosa).toBe("No puede cambiar su rol");
  });

  test("CP-06.23 médico no edita a otros usuarios (403)", async () => {
    q.mockResolvedValueOnce(roles("medico"));
    expect((await request(app).put("/usuarios/5").set("Authorization", MEDICO).send({ correo: "x@c.cl" })).status).toBe(403);
  });

  test("CP-06.24 usuario sin rol clínico no puede cambiar roles (403)", async () => {
    q.mockResolvedValueOnce(roles());
    const res = await request(app)
      .put("/usuarios/2")
      .set("Authorization", MEDICO)
      .send({ correo: "x@c.cl", rol_id: 1 });
    expect(res.status).toBe(403);
    expect(res.body.glosa).toBe("No tiene permisos para cambiar roles");
  });

  test("CP-06.25 usuario inexistente responde 404", async () => {
    q.mockResolvedValueOnce(roles("administrador")).mockResolvedValueOnce(vacio());
    expect((await request(app).put("/usuarios/99").set("Authorization", SIN_ID).send({ correo: "x@c.cl" })).status).toBe(404);
  });

  test("CP-06.26 sin campos de datos solo actualiza el rol (handler directo)", async () => {
    q.mockResolvedValueOnce(roles("admin"))
      .mockResolvedValueOnce(vacio())
      .mockResolvedValueOnce(vacio())
      .mockResolvedValueOnce(rows({ id: 5 }))
      .mockResolvedValueOnce(vacio());
    const res = resMock();
    await handlerDe(router, "put", "/:id")(
      { headers: { authorization: SIN_ID }, params: { id: "5" }, body: { rol_id: 3 } },
      res
    );
    expect(res.json).toHaveBeenCalledWith({ id: 5 });
    expect(q.mock.calls[4][1][0]).toBeNull();
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.33 error de BD responde 500 (%p)", async (err, glosa) => {
    q.mockRejectedValueOnce(err);
    const res = await request(app).put("/usuarios/1").set("Authorization", ADMIN).send({ correo: "x@c.cl" });
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe(glosa);
  });

  test.each([
    [new Error("respuesta rota"), "respuesta rota"],
    ["texto roto", "texto roto"],
  ])("NF-02.34 falla al responder se captura en el manejador externo (%p)", async (err, glosa) => {
    q.mockResolvedValueOnce(roles("admin"))
      .mockResolvedValueOnce(rows({ id: 1 }))
      .mockResolvedValueOnce(rows({ id: 1 }))
      .mockResolvedValueOnce(vacio());
    const res = resMock();
    res.json
      .mockImplementationOnce(() => {
        throw err;
      })
      .mockImplementationOnce(() => {
        throw err;
      });
    await handlerDe(router, "put", "/:id")(
      { headers: { authorization: ADMIN }, params: { id: "1" }, body: { correo: "x@c.cl" } },
      res
    );
    expect(res.json).toHaveBeenLastCalledWith({ error: "Error al actualizar usuario", glosa });
  });
});

describe("CP-06.E Actualizar usuario - lógica empresa (PUT /usuarios/:id)", () => {
  const filaAuth = (rol_id, rol_nombre) => rows({ rol_id, rol_nombre });

  test("CP-06.27 usuario sin relación con la empresa recibe 403", async () => {
    q.mockResolvedValueOnce(vacio());
    expect((await request(app).put("/usuarios/5").set("Authorization", EMPRESA).send({ correo: "x@c.cl" })).status).toBe(403);
  });

  test("CP-06.28 usuario no administrador recibe 403", async () => {
    q.mockResolvedValueOnce(filaAuth(2, "vendedor"));
    expect((await request(app).put("/usuarios/5").set("Authorization", EMPRESA).send({ correo: "x@c.cl" })).status).toBe(403);
  });

  test("CP-06.29 administrador no puede cambiar su propio rol (400)", async () => {
    q.mockResolvedValueOnce(filaAuth(1, null));
    const res = await request(app)
      .put("/usuarios/1")
      .set("Authorization", EMPRESA)
      .send({ correo: "x@c.cl", rol_id: 2 });
    expect(res.status).toBe(400);
    expect(res.body.glosa).toBe("No puedes cambiar tu propio rol");
  });

  test("CP-06.30 no se puede quitar el rol al único administrador (400)", async () => {
    q.mockResolvedValueOnce(filaAuth(5, "admin"))
      .mockResolvedValueOnce(rows({ rol_id: 1 }))
      .mockResolvedValueOnce(rows({ count: "1" }));
    const res = await request(app)
      .put("/usuarios/5")
      .set("Authorization", EMPRESA)
      .send({ correo: "x@c.cl", rol_id: 2 });
    expect(res.status).toBe(400);
  });

  test.each([
    ["varios admins", rows({ rol_id: 1 }), rows({ count: "2" }), 2],
    ["único admin mantiene rol 1", rows({ rol_id: 1 }), rows({ count: "1" }), 1],
  ])("CP-06.31 cambio de rol permitido: %s", async (_d, actual, cuenta, rol) => {
    q.mockResolvedValueOnce(filaAuth(5, "administrador"))
      .mockResolvedValueOnce(actual)
      .mockResolvedValueOnce(cuenta)
      .mockResolvedValueOnce(rows({ id: 5 }))
      .mockResolvedValueOnce(rows({ id: 9 }))
      .mockResolvedValueOnce(vacio())
      .mockResolvedValueOnce(rows({ id: 5, rol_id: rol }))
      .mockResolvedValueOnce(vacio());
    const res = await request(app)
      .put("/usuarios/5")
      .set("Authorization", EMPRESA)
      .send({ nombre_usuario: "otro", contrasena_hash: "M3dico$Seguro2026", correo: "x@c.cl", rol_id: rol });
    expect(res.status).toBe(200);
    expect(q.mock.calls[5][0]).toMatch(/UPDATE empresa_usuarios SET rol_id/);
  });

  test("CP-06.32 usuario destino sin relación previa: no actualiza rol", async () => {
    q.mockResolvedValueOnce(filaAuth(1, null))
      .mockResolvedValueOnce(rows({ rol_id: 2 }))
      .mockResolvedValueOnce(rows({ id: 5 }))
      .mockResolvedValueOnce(vacio())
      .mockResolvedValueOnce(rows({ id: 5 }))
      .mockResolvedValueOnce(vacio());
    const res = await request(app)
      .put("/usuarios/5")
      .set("Authorization", EMPRESA_SIN_ID)
      .send({ correo: "x@c.cl", rol_id: 2 });
    expect(res.status).toBe(200);
    expect(q.mock.calls[5][1][0]).toBeNull();
  });

  test("CP-06.33 usuario destino inexistente en empresa_usuarios y en usuarios", async () => {
    q.mockResolvedValueOnce(filaAuth(1, null)).mockResolvedValueOnce(vacio()).mockResolvedValueOnce(vacio());
    const res = await request(app)
      .put("/usuarios/5")
      .set("Authorization", EMPRESA)
      .send({ correo: "x@c.cl", rol_id: 2 });
    expect(res.status).toBe(404);
  });

  test("CP-06.34 sin campos de datos ni rol solo devuelve el usuario (handler directo)", async () => {
    q.mockResolvedValueOnce(filaAuth(1, null)).mockResolvedValueOnce(rows({ id: 5 })).mockResolvedValueOnce(vacio());
    const res = resMock();
    await handlerDe(router, "put", "/:id")(
      { headers: { authorization: EMPRESA }, params: { id: "5" }, body: {} },
      res
    );
    expect(res.json).toHaveBeenCalledWith({ id: 5 });
    expect(q.mock.calls[2][1][1]).toBe("USUARIOS_ACTUALIZAR: actualizó usuario ID 5");
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.35 error de BD responde 500 (%p)", async (err, glosa) => {
    q.mockRejectedValueOnce(err);
    const res = await request(app).put("/usuarios/5").set("Authorization", EMPRESA).send({ correo: "x@c.cl" });
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe(glosa);
  });
});

describe("CP-06.F Eliminar usuario (DELETE /usuarios/:id)", () => {
  test("CP-06.35 elimina y audita con el nombre del usuario del token", async () => {
    q.mockResolvedValueOnce(roles("admin"))
      .mockResolvedValueOnce(rows({ id: 5 }))
      .mockResolvedValueOnce(vacio());
    const res = await request(app).delete("/usuarios/5").set("Authorization", ADMIN);
    expect(res.body).toEqual({ deleted: true });
    expect(q.mock.calls[2][1]).toEqual([1, "USUARIOS_ELIMINAR: eliminó usuario ID 5"]);
  });

  test("CP-06.37 sin token responde 401 sin borrar el usuario", async () => {
    const res = await request(app).delete("/usuarios/6");
    expect(res.status).toBe(401);
    expect(q).not.toHaveBeenCalled();
  });

  test("CP-06.36 usuario inexistente responde 404", async () => {
    q.mockResolvedValueOnce(roles("admin")).mockResolvedValueOnce(vacio());
    expect((await request(app).delete("/usuarios/5").set("Authorization", ADMIN)).status).toBe(404);
  });

  test.each([
    [new Error("x"), "x"],
    ["y", "y"],
  ])("NF-02.36 error de BD responde 500 (%p)", async (err, glosa) => {
    q.mockRejectedValueOnce(err);
    const res = await request(app).delete("/usuarios/5").set("Authorization", ADMIN);
    expect(res.status).toBe(500);
    expect(res.body.glosa).toBe(glosa);
  });
});
