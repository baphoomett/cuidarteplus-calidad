/**
 * UT-FE Pruebas unitarias de utilidades, esquemas de validación (yup) y tema.
 */
import { normalizeRut, Comunas, comunaARegion, regionesDeChile, bancosChile, giros, cargosRepresentante } from "../../src/lib/utils";
import { loginSchema, registerUserSchema, registerEmpresaSchema } from "../../src/validations/auth";
import { pacienteSchema } from "../../src/validations/pacientes";
import { updateUsuarioSchema, updatePasswordSchema } from "../../src/validations/users";
import { clienteSchema } from "../../src/validations/clients";
import { contratoSchema } from "../../src/validations/contracts";
import { updateEmpresaSchema } from "../../src/validations/empresas";
import theme from "../../src/theme";

/** Devuelve los mensajes de error de un esquema (vacío si es válido) */
async function errores(schema, datos) {
  try {
    await schema.validate(datos, { abortEarly: false });
    return [];
  } catch (e) {
    return e.errors;
  }
}

describe("UT-FE-01 lib/utils", () => {
  test("UT-FE-01.1 normalizeRut elimina los puntos y respeta valores vacíos", () => {
    expect(normalizeRut("12.345.678-9")).toBe("12345678-9");
    expect(normalizeRut("")).toBe("");
    expect(normalizeRut(null)).toBeNull();
  });

  test("UT-FE-01.2 catálogos de Chile: comunas ordenadas y mapeadas a su región", () => {
    expect(Comunas).toEqual([...Comunas].sort((a, b) => a.localeCompare(b, "es")));
    expect(comunaARegion["Providencia"]).toBe("Región Metropolitana de Santiago");
    expect(comunaARegion["Arica"]).toBe("Región de Arica y Parinacota");
    expect(regionesDeChile).toHaveLength(16);
    expect(bancosChile.length).toBeGreaterThan(10);
    expect(giros).toContain("Atenciones Médicas");
    expect(cargosRepresentante).toContain("Director");
  });
});

describe("UT-FE-02 validations/auth", () => {
  test("UT-FE-02.1 loginSchema exige usuario (3-50) y contraseña", async () => {
    expect(await errores(loginSchema, { nombre_usuario: "admin", password: "x" })).toEqual([]);
    expect(await errores(loginSchema, {})).toEqual(
      expect.arrayContaining(["El nombre de usuario es requerido", "La contraseña es requerida"])
    );
    expect(await errores(loginSchema, { nombre_usuario: "ab", password: "x" })).toContain(
      "El nombre de usuario debe tener al menos 3 caracteres"
    );
  });

  test("UT-FE-02.2 registerUserSchema valida correo y largo mínimo de contraseña", async () => {
    expect(await errores(registerUserSchema, { nombre_usuario: "juan", correo: "j@c.cl", contrasena_hash: "123456" })).toEqual([]);
    expect(await errores(registerUserSchema, { nombre_usuario: "juan", correo: "no-correo", contrasena_hash: "123" })).toEqual(
      expect.arrayContaining(["El correo debe tener un formato válido", "La contraseña debe tener al menos 6 caracteres"])
    );
  });

  test("UT-FE-02.3 registerEmpresaSchema exige todos los datos de la empresa", async () => {
    const ok = { nombre: "Clínica", calle: "A 1", comuna: "Santiago", region: "RM", telefono: "1", correo: "c@c.cl" };
    expect(await errores(registerEmpresaSchema, ok)).toEqual([]);
    expect((await errores(registerEmpresaSchema, {})).length).toBe(6);
  });
});

describe("UT-FE-03 validations/pacientes", () => {
  const valido = {
    rut: "12.345.678-5",
    primer_nombre: "Ana",
    apellido_paterno: "Pérez",
    fecha_nacimiento: "1990-01-01",
    sexo: "F",
    email: "ana@c.cl",
  };

  test("UT-FE-03.1 acepta una ficha mínima válida", async () => {
    expect(await errores(pacienteSchema, valido)).toEqual([]);
  });

  test("UT-FE-03.2 rechaza RUT mal formado, sexo y grupo sanguíneo inválidos y fecha futura", async () => {
    const msgs = await errores(pacienteSchema, {
      ...valido,
      rut: "12345678",
      sexo: "X",
      grupo_sanguineo: "Z+",
      estado_civil: "otro",
      fecha_nacimiento: "2999-01-01",
    });
    expect(msgs).toEqual(
      expect.arrayContaining([
        "El RUT debe tener formato válido (ej: 12.345.678-9 o 12345678-9)",
        "El sexo debe ser M, F u O",
        "Grupo sanguíneo inválido",
        "Estado civil inválido",
        "La fecha de nacimiento no puede ser futura",
      ])
    );
  });
});

describe("UT-FE-04 validations/users", () => {
  test("UT-FE-04.1 updateUsuarioSchema exige correo válido", async () => {
    expect(await errores(updateUsuarioSchema, { correo: "a@b.cl" })).toEqual([]);
    expect(await errores(updateUsuarioSchema, { correo: "x" })).toContain("El correo debe tener un formato válido");
  });

  test("UT-FE-04.2 updatePasswordSchema exige que ambas contraseñas coincidan", async () => {
    expect(await errores(updatePasswordSchema, { contrasena_hash: "abcdef", confirmar_contrasena: "abcdef" })).toEqual([]);
    expect(await errores(updatePasswordSchema, { contrasena_hash: "abcdef", confirmar_contrasena: "zzzzzz" })).toContain(
      "Las contraseñas no coinciden"
    );
  });
});

describe("UT-FE-05 Esquemas heredados sin uso (clientes, contratos, empresas)", () => {
  const cliente = {
    nombre: "Cliente",
    correo: "c@c.cl",
    telefono: "1",
    rut: "1-9",
    nombre_fantasia: "F",
    giro_actividad_economica: "Salud",
    nombre_representante: "R",
    cargo_representante: "Director",
    correo_representante: "r@c.cl",
    telefono_representante: "2",
    relacion_representante: "Dueño",
    direccion_calle: "Calle",
    direccion_numero: "1",
    direccion_ciudad: "Stgo",
    direccion_region: "RM",
    sitio_web: "https://c.cl",
    telefono_corporativo: "3",
    nombre_banco: "Banco",
    numero_cuenta: "123",
    titular_cuenta: "T",
    metodo_pago: "transferencia",
    dia_pago: "15",
    moneda: "CLP",
  };

  test.each([
    ["15", true],
    ["0", false],
    ["32", false],
    ["abc", false],
    ["", false],
  ])("UT-FE-05.1 clienteSchema valida el día de pago %s → %s", async (dia, valido) => {
    const msgs = await errores(clienteSchema, { ...cliente, dia_pago: dia });
    expect(msgs.length === 0).toBe(valido);
  });

  test("UT-FE-05.2 contratoSchema exige fecha de fin posterior a la de inicio", async () => {
    const base = { cliente_id: "1", titulo: "Contrato", fecha_inicio: "2026-01-10" };
    expect(await errores(contratoSchema, { ...base, fecha_fin: "2026-02-01" })).toEqual([]);
    expect(await errores(contratoSchema, { ...base, fecha_fin: "2026-01-01" })).toContain(
      "La fecha de fin debe ser posterior a la fecha de inicio"
    );
  });

  test("UT-FE-05.3 updateEmpresaSchema exige nombre, dirección, teléfono y correo", async () => {
    expect(await errores(updateEmpresaSchema, { nombre: "Emp", direccion: "D", telefono: "1", correo: "e@e.cl" })).toEqual([]);
    expect((await errores(updateEmpresaSchema, {})).length).toBe(4);
  });
});

describe("UT-FE-06 Tema visual", () => {
  test("UT-FE-06.1 usa la paleta institucional y botones sin mayúsculas forzadas", () => {
    expect(theme.palette.primary.main).toBe("#3293BA");
    expect(theme.components.MuiButton.styleOverrides.root.textTransform).toBe("none");
  });
});
