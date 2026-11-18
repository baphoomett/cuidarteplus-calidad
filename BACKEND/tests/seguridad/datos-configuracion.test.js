/**
 * Pruebas de seguridad - Inyección, manejo de errores, archivos y configuración
 * (OWASP A03: Injection, A04: Insecure Design, A05: Security Misconfiguration)
 *
 * Cada prueba describe el comportamiento SEGURO esperado; un fallo es un hallazgo.
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
const MEDICO = bearer({ usuarioId: 2, nombreUsuario: "medico" });
const ROLES_DE = /FROM usuario_roles ur/;

describe("SEG-10 Inyección SQL (controles que SÍ funcionan)", () => {
  const PAYLOAD = "admin' OR '1'='1' --";

  test("SEG-10.1 el login usa consultas parametrizadas y no permite bypass con ' OR '1'='1", async () => {
    simularBD(q, []);
    const res = await request(app)
      .post("/autenticacion/login")
      .send({ nombre_usuario: PAYLOAD, password: "x' OR '1'='1" });

    expect(res.status).toBe(401);
    const [[sql, params]] = q.mock.calls;
    expect(sql).not.toContain(PAYLOAD);
    expect(params).toEqual([PAYLOAD]);
  });

  test("SEG-10.2 el parámetro :id de la URL viaja como parámetro y no como SQL", async () => {
    simularBD(q, [[ROLES_DE, roles("medico")]]);
    const ataque = "1 OR 1=1; DROP TABLE pacientes; --";

    await request(app)
      .get(`/pacientes/${encodeURIComponent(ataque)}`)
      .set("Authorization", MEDICO);

    const [[sql, params]] = consultas(q, /WHERE p.id = \$1/);
    expect(sql).not.toContain("DROP TABLE");
    expect(params).toEqual([ataque]);
  });

  test("SEG-10.3 el UPDATE dinámico ignora nombres de columna inyectados en el cuerpo", async () => {
    simularBD(q, [
      [ROLES_DE, roles("medico")],
      [/UPDATE pacientes SET/, rows({ id: 1 })],
    ]);

    await request(app)
      .put("/pacientes/1")
      .set("Authorization", MEDICO)
      .send({ telefono: "+56900000000", "telefono=telefono, rut": "x", "1=1; DROP TABLE pacientes; --": "y" });

    const [[sql]] = consultas(q, /UPDATE pacientes SET/);
    expect(sql).toBe("UPDATE pacientes SET telefono=$1 WHERE id=$2 RETURNING *");
  });
});

describe("SEG-12 Exposición de información interna en errores", () => {
  const errorInterno = Object.assign(
    new Error('relation "usuarios" does not exist at character 47 (host=10.0.0.5 user=postgres)'),
    { code: "42P01" }
  );

  test("SEG-12.1 un error de base de datos en el login no expone detalles internos", async () => {
    simularBD(q, [[/FROM usuarios/, errorInterno]]);
    const res = await request(app)
      .post("/autenticacion/login")
      .send({ nombre_usuario: "admin", password: "admin" });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|postgres|host=|character/);
  });

  test("SEG-12.2 un error de base de datos al listar pacientes no expone detalles internos", async () => {
    simularBD(q, [
      [ROLES_DE, roles("medico")],
      [/FROM pacientes p/, errorInterno],
    ]);
    const res = await request(app).get("/pacientes").set("Authorization", MEDICO);

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|postgres|host=|character/);
  });
});

describe("SEG-13 Cabeceras HTTP de seguridad", () => {
  test("SEG-13.1 la API envía cabeceras de endurecimiento y oculta la tecnología", async () => {
    const res = await request(app).get("/");

    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });
});

describe("SEG-14 Política CORS", () => {
  test("SEG-14.1 la API no autoriza peticiones desde un origen arbitrario", async () => {
    const res = await request(app).get("/").set("Origin", "https://sitio-malicioso.example");
    const permitido = res.headers["access-control-allow-origin"];
    expect(permitido === "*" || permitido === "https://sitio-malicioso.example").toBe(false);
  });
});

describe("SEG-15 Validación del contenido de archivos subidos (POST /documentos)", () => {
  function subir(nombre, contenido, mime) {
    return request(app)
      .post("/documentos")
      .set("Authorization", MEDICO)
      .field("examen_medico_id", "1")
      .field("paciente_id", "1")
      .attach("documento", Buffer.from(contenido), { filename: nombre, contentType: mime });
  }

  beforeEach(() =>
    simularBD(q, [
      [ROLES_DE, roles("medico")],
      [/INSERT INTO documentos_examen/, (sql, p) => rows({ id: 1, nombre_archivo: p[3] })],
    ])
  );

  test("SEG-15.1 rechaza un ejecutable disfrazado de PDF (MIME declarado por el cliente)", async () => {
    const res = await subir("resultado.exe", "MZ\x90\x00\x03 ejecutable", "application/pdf");
    expect(res.status).toBe(400);
    expect(consultas(q, /INSERT INTO documentos_examen/)).toHaveLength(0);
  });

  test("SEG-15.2 rechaza un HTML con script declarado como imagen PNG", async () => {
    const res = await subir("foto.png", "<script>alert(document.cookie)</script>", "image/png");
    expect(res.status).toBe(400);
  });

  test("SEG-15.3 sanea el nombre de archivo en la cabecera Content-Disposition", async () => {
    simularBD(q, [
      [ROLES_DE, roles("medico")],
      [
        /FROM documentos_examen de/,
        rows({ id: 9, nombre_archivo: 'a.pdf"; filename*=UTF-8\'\'malware.html', documento: Buffer.from("x") }),
      ],
    ]);
    const res = await request(app).get("/documentos/9").set("Authorization", MEDICO);
    expect(res.headers["content-disposition"]).not.toContain("malware.html");
  });

  test("SEG-15.4 rechaza tipos MIME no permitidos (control que SÍ funciona)", async () => {
    const res = await subir("script.sh", "#!/bin/sh\nrm -rf /", "application/x-sh");
    expect(res.status).not.toBe(201);
    expect(consultas(q, /INSERT INTO documentos_examen/)).toHaveLength(0);
  });
});

describe("SEG-23 Documentación de la API expuesta públicamente", () => {
  test("SEG-23.1 la especificación OpenAPI no es accesible sin autenticación", async () => {
    const res = await request(app).get("/openapi.json");
    expect([401, 403, 404]).toContain(res.status);
  });
});
