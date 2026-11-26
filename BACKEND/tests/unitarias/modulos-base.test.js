/**
 * Pruebas unitarias de los módulos base del backend:
 * utils/rut, middleware/validate, middleware/delay, db.js y app.js.
 */
const { normalizeRut } = require("../../src/utils/rut");
const validate = require("../../src/middleware/validate");
const delayMiddleware = require("../../src/middleware/delay");
const yup = require("yup");

function resMock() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe("utils/rut - normalizeRut", () => {
  test("CP-03.1 elimina los puntos de un RUT formateado", () => {
    expect(normalizeRut("12.345.678-9")).toBe("12345678-9");
  });
  test("CP-03.2 devuelve el mismo valor si viene vacío", () => {
    expect(normalizeRut("")).toBe("");
    expect(normalizeRut(undefined)).toBeUndefined();
  });
});

describe("middleware/validate", () => {
  const schema = yup.object({ nombre: yup.string().required("requerido") });

  test("NF-02.1 deja pasar el request cuando los datos son válidos", async () => {
    const next = jest.fn();
    await validate(schema)({ body: { nombre: "x" } }, resMock(), next);
    expect(next).toHaveBeenCalled();
  });

  test("NF-02.2 responde 400 con el detalle por campo cuando falla la validación", async () => {
    const res = resMock();
    await validate(schema)({ body: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].detalles).toEqual([
      { field: "nombre", message: "requerido" },
    ]);
  });

  test("NF-02.3 valida otra fuente del request (query)", async () => {
    const next = jest.fn();
    await validate(schema, "query")({ query: { nombre: "y" } }, resMock(), next);
    expect(next).toHaveBeenCalled();
  });

  test("NF-02.4 responde 500 si el esquema lanza un error inesperado", async () => {
    const roto = { validate: () => Promise.reject(new Error("fallo interno")) };
    const res = resMock();
    await validate(roto)({ body: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].glosa).toBe("fallo interno");
  });

  test("NF-02.5 responde 500 con toString() si el error no trae mensaje", async () => {
    const roto = { validate: () => Promise.reject({ toString: () => "sin mensaje" }) };
    const res = resMock();
    await validate(roto)({ body: {} }, res, jest.fn());
    expect(res.json.mock.calls[0][0].glosa).toBe("sin mensaje");
  });
});

describe("middleware/delay", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("REN-00.1 retrasa la respuesta 5000 ms por defecto", () => {
    const next = jest.fn();
    delayMiddleware()({}, {}, next);
    jest.advanceTimersByTime(4999);
    expect(next).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(next).toHaveBeenCalled();
  });

  test("REN-00.2 acepta un retraso personalizado", () => {
    const next = jest.fn();
    delayMiddleware(10)({}, {}, next);
    jest.advanceTimersByTime(10);
    expect(next).toHaveBeenCalled();
  });
});

describe("db.js - pool de conexiones", () => {
  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  function cargarDb() {
    let PoolMock;
    let db;
    jest.isolateModules(() => {
      jest.doMock("dotenv", () => ({ config: jest.fn() }));
      jest.doMock("pg", () => {
        PoolMock = jest.fn(function (cfg) {
          this.cfg = cfg;
        });
        return { Pool: PoolMock };
      });
      db = require("../../src/db");
    });
    return { db, PoolMock };
  }

  test("SEG-19.1 sin DATABASE_URL falla explícitamente y no usa credenciales embebidas", () => {
    delete process.env.DATABASE_URL;
    expect(() => cargarDb()).toThrow("Falta la variable de entorno DATABASE_URL");
  });

  test("NF-02.6 usa DATABASE_URL cuando está definida", () => {
    process.env.DATABASE_URL = "postgres://u:p@h:5432/db";
    const { db } = cargarDb();
    expect(db.pool.cfg.connectionString).toBe("postgres://u:p@h:5432/db");
  });
});

describe("app.js - arranque del servidor", () => {
  test("CP-00.1 expone salud, OpenAPI y Swagger", async () => {
    jest.doMock("../../src/db", () => ({ pool: { query: jest.fn() } }));
    jest.resetModules();
    jest.doMock("morgan", () => () => (req, res, next) => next());
    const request = require("supertest");
    const app = require("../../src/app");
    const salud = await request(app).get("/");
    expect(salud.body).toEqual({ name: "cuidarteplus", status: "ok" });
    const spec = await request(app).get("/openapi.json");
    expect(spec.status).toBe(404);
    const docs = await request(app).get("/docs/");
    expect(docs.status).toBe(200);
  });
});
