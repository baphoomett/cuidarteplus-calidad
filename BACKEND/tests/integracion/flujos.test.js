/**
 * Pruebas de integración: API real (Express) + PostgreSQL real con los datos
 * semilla de sql/dump-cuidarteplus.sql.
 *
 * Requisitos:  docker compose up -d   (desde la raíz del proyecto)
 * Ejecución:   npm run test:integracion
 * API_URL permite apuntar a otro entorno (por defecto http://localhost:4444).
 *
 * Cada prueba deja la base de datos como la encontró (elimina lo que crea).
 */
const API = process.env.API_URL || "http://localhost:4444";
const sufijo = `${Date.now()}`.slice(-7);

async function api(metodo, ruta, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const inicio = Date.now();
  const res = await fetch(`${API}${ruta}`, { method: metodo, headers, body: payload });
  const tipo = res.headers.get("content-type") || "";
  const datos = tipo.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, body: datos, headers: res.headers, ms: Date.now() - inicio };
}

async function login(nombre_usuario, password) {
  const res = await api("POST", "/autenticacion/login", { body: { nombre_usuario, password } });
  expect(res.status).toBe(200);
  return res.body.token;
}

/** RUT chileno válido (módulo 11) a partir de un número */
function rutValido(numero) {
  let suma = 0;
  let mult = 2;
  for (const d of String(numero).split("").reverse()) {
    suma += Number(d) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const dv = 11 - (suma % 11);
  return `${numero}-${dv === 11 ? "0" : dv === 10 ? "K" : dv}`;
}

let ADMIN;
let MEDICO;
let PACIENTE;

beforeAll(async () => {
  const salud = await api("GET", "/").catch(() => null);
  if (!salud || salud.status !== 200) {
    throw new Error(`La API no responde en ${API}. Ejecute "docker compose up -d" antes de estas pruebas.`);
  }
  [ADMIN, MEDICO, PACIENTE] = await Promise.all([
    login("admin", "admin"),
    login("medico", "medico"),
    login("paciente", "paciente"),
  ]);
});

describe("INT-01 Ciclo de vida clínico completo (paciente → examen → documento)", () => {
  test("INT-01.1 médico registra paciente, examen y documento; admin los elimina y queda trazabilidad", async () => {
    const rut = rutValido(30000000 + Number(sufijo.slice(-6)));

    // 1. El médico crea la ficha del paciente
    const paciente = await api("POST", "/pacientes", {
      token: MEDICO,
      body: {
        rut,
        primer_nombre: "Integración",
        apellido_paterno: "Prueba",
        fecha_nacimiento: "1990-01-01",
        sexo: "F",
        email: `int01.${sufijo}@cuidarteplus.cl`,
      },
    });
    expect(paciente.status).toBe(201);
    const pacienteId = paciente.body.id;

    // 2. El médico registra un examen (tipo 1: Hemograma completo)
    const examen = await api("POST", "/examenes", {
      token: MEDICO,
      body: { tipo_examen_medico_id: 1, paciente_id: Number(pacienteId), diagnosis: "Control", tratamiento: "Ninguno" },
    });
    expect(examen.status).toBe(201);
    const examenId = examen.body.id;

    // 3. El examen aparece al consultar por paciente, con el nombre del tipo
    const porPaciente = await api("GET", `/examenes/paciente/${pacienteId}`, { token: MEDICO });
    expect(porPaciente.status).toBe(200);
    expect(porPaciente.body[0]).toMatchObject({ tipo_examen_nombre: "Hemograma completo", paciente_rut: rut });

    // 4. Sube un PDF y lo descarga íntegro
    const form = new FormData();
    form.append("examen_medico_id", String(examenId));
    form.append("paciente_id", String(pacienteId));
    const contenido = `%PDF-1.4 resultado ${sufijo}`;
    form.append("documento", new Blob([contenido], { type: "application/pdf" }), "resultado.pdf");
    const subida = await api("POST", "/documentos", { token: MEDICO, form });
    expect(subida.status).toBe(201);
    const docId = subida.body.documento.id;

    const lista = await api("GET", `/documentos/examen/${examenId}`, { token: MEDICO });
    expect(lista.body.map((d) => String(d.id))).toContain(String(docId));

    const descarga = await api("GET", `/documentos/${docId}`, { token: MEDICO });
    expect(descarga.status).toBe(200);
    expect(descarga.headers.get("content-type")).toBe("application/pdf");
    expect(descarga.body.toString()).toBe(contenido);

    // 5. El admin elimina el paciente; el examen y el documento se eliminan en cascada
    const borrado = await api("DELETE", `/pacientes/${pacienteId}`, { token: ADMIN });
    expect(borrado.status).toBe(200);
    expect((await api("GET", `/examenes/${examenId}`, { token: MEDICO })).status).toBe(404);
    expect((await api("GET", `/documentos/${docId}`, { token: MEDICO })).status).toBe(404);

    // 6. Toda la operación quedó registrada en la auditoría
    const auditoria = await api("GET", "/auditoria", { token: ADMIN });
    const acciones = auditoria.body.slice(0, 50).map((a) => a.accion).join("\n");
    expect(acciones).toContain(`PACIENTES_CREAR: creó paciente Integración Prueba (RUT: ${rut})`);
    expect(acciones).toContain(`EXAMENES_CREAR: creó examen médico ID ${examenId}`);
    expect(acciones).toContain(`DOCUMENTOS_CREAR: subió documento "resultado.pdf"`);
    expect(acciones).toContain(`PACIENTES_ELIMINAR: eliminó paciente ID ${pacienteId}`);
  });
});

describe("INT-02 Registro e inicio de sesión de un paciente nuevo", () => {
  test("INT-02.1 el usuario registrado inicia sesión con rol paciente y ve su ficha básica", async () => {
    const rut = rutValido(31000000 + Number(sufijo.slice(-6)));
    const nombre = `pac${sufijo}`;
    const registro = await api("POST", "/autenticacion/registro", {
      body: { nombre_usuario: nombre, password: "Clave$2026", correo: `${nombre}@cuidarteplus.cl`, rut },
    });
    expect(registro.status).toBe(201);
    const usuarioId = registro.body.usuario.id;

    try {
      const token = await login(nombre, "Clave$2026");
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      expect(payload.rolNombre).toBe("paciente");
      expect(payload.pacienteId).not.toBeNull();

      const ficha = await api("GET", `/pacientes/${payload.pacienteId}`, { token });
      expect(ficha.status).toBe(200);
      expect(ficha.body.rut).toBe(rut);

      const examenes = await api("GET", "/examenes", { token });
      expect(examenes.status).toBe(200);
      expect(examenes.body).toEqual([]);
    } finally {
      const ficha = await api("GET", `/pacientes/buscar/rut/${rut}`, { token: ADMIN });
      if (ficha.status === 200) await api("DELETE", `/pacientes/${ficha.body.id}`, { token: ADMIN });
      await api("DELETE", `/usuarios/${usuarioId}`, { token: ADMIN });
    }
  });

  test("INT-02.2 la BD rechaza un RUT duplicado y la API responde 400", async () => {
    const res = await api("POST", "/pacientes", {
      token: MEDICO,
      body: {
        rut: "16.789.456-K",
        primer_nombre: "Duplicado",
        apellido_paterno: "Prueba",
        fecha_nacimiento: "1990-01-01",
        sexo: "M",
        email: `dup.${sufijo}@cuidarteplus.cl`,
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.glosa).toBe("El RUT o email ya existe");
  });
});

describe("INT-03 Aislamiento de datos del paciente con datos reales", () => {
  test("INT-03.1 el paciente semilla solo ve sus propios exámenes y su propia ficha", async () => {
    const payload = JSON.parse(Buffer.from(PACIENTE.split(".")[1], "base64url").toString());
    const propios = await api("GET", "/examenes", { token: PACIENTE });
    expect(propios.status).toBe(200);
    for (const ex of propios.body) expect(String(ex.paciente_id)).toBe(String(payload.pacienteId));

    expect((await api("GET", `/pacientes/${payload.pacienteId}`, { token: PACIENTE })).status).toBe(200);
    expect((await api("GET", "/pacientes/2", { token: PACIENTE })).status).toBe(403);
    expect((await api("GET", "/examenes/paciente/2", { token: PACIENTE })).status).toBe(403);
  });

  test("INT-03.2 el inicio de sesión con inyección SQL es rechazado por la BD real", async () => {
    const res = await api("POST", "/autenticacion/login", {
      body: { nombre_usuario: "admin' OR '1'='1' --", password: "' OR '1'='1" },
    });
    expect(res.status).toBe(401);
  });
});

describe("INT-04 Vulnerabilidades reproducidas contra el entorno real", () => {
  test("INT-04.1 la ficha clínica de un paciente real NO debe obtenerse sin token", async () => {
    const res = await api("GET", "/pacientes/buscar/rut/16789456-K");
    expect(res.status).toBe(401);
  });

  test("INT-04.2 registrarse con el RUT de un paciente real NO debe dar acceso a su historial", async () => {
    const nombre = `intruso${sufijo}`;
    const registro = await api("POST", "/autenticacion/registro", {
      body: { nombre_usuario: nombre, password: "Clave$2026", correo: `${nombre}@evil.cl`, rut: "17654321-K" },
    });
    try {
      if (registro.status === 201) {
        const token = await login(nombre, "Clave$2026");
        const ficha = await api("GET", "/pacientes/10", { token });
        expect(ficha.status).not.toBe(200);
      } else {
        expect([400, 409]).toContain(registro.status);
      }
    } finally {
      if (registro.status === 201) {
        // Al borrar el usuario la FK deja pacientes.usuario_id en NULL (estado original)
        await api("DELETE", `/usuarios/${registro.body.usuario.id}`, { token: ADMIN });
      }
    }
  });
});
