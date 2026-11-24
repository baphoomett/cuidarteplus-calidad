// PRUEBAS UNITARIAS DE CAJA NEGRA
// Se diseñaron leyendo los requisitos, sin mirar el código:
// particiones de equivalencia y valores límite.
const { loginSchema } = require("../../src/validations/auth");
const { pacienteSchema } = require("../../src/validations/pacientes");
const { examenMedicoSchema } = require("../../src/validations/examenes");
 
const esValido = (schema, datos) => schema.isValid(datos);
 
describe("Login: largo del nombre de usuario (3 a 50 caracteres)", () => {
  test.each([
    ["vacío", "", false],
    ["2 caracteres (límite inferior - 1)", "ab", false],
    ["3 caracteres (límite inferior)", "abc", true],
    ["50 caracteres (límite superior)", "a".repeat(50), true],
    ["51 caracteres (límite superior + 1)", "a".repeat(51), false],
  ])("Usuario %s -> válido: %s", async (_caso, usuario, esperado) => {
    await expect(esValido(loginSchema, { nombre_usuario: usuario, password: "x" }))
      .resolves.toBe(esperado);
  });
 
  test("Sin contraseña -> inválido", async () => {
    await expect(esValido(loginSchema, { nombre_usuario: "admin" })).resolves.toBe(false);
  });
});
 
describe("Pacientes: reglas de identificación y datos personales", () => {
  const base = {
    rut: "12.345.678-5",
    primer_nombre: "Ana",
    apellido_paterno: "Perez",
    fecha_nacimiento: "1990-01-01",
    sexo: "F",
    email: "ana.prueba@example.com",
  };
 
  test("Datos correctos -> válido", async () => {
    await expect(esValido(pacienteSchema, base)).resolves.toBe(true);
  });
 
  test("RUT con formato inválido -> inválido", async () => {
    await expect(esValido(pacienteSchema, { ...base, rut: "abc" }))
      .resolves.toBe(false);
  });
 
  test.each([
    ["nombre de un carácter", "A"],
    ["nombre vacío", ""],
  ])("primer_nombre %s -> inválido", async (_caso, valor) => {
    await expect(esValido(pacienteSchema, { ...base, primer_nombre: valor }))
      .resolves.toBe(false);
  });
 
  test("Fecha de nacimiento futura -> inválida", async () => {
    await expect(esValido(pacienteSchema, { ...base, fecha_nacimiento: "2099-01-01" }))
      .resolves.toBe(false);
  });
});

describe("Exámenes: reglas de identificación", () => {
  test("Datos correctos -> válido", async () => {
    await expect(esValido(examenMedicoSchema, {
      tipo_examen_medico_id: 1,
      paciente_id: 1,
    })).resolves.toBe(true);
  });

  test("tipo_examen_medico_id cero -> inválido", async () => {
    await expect(esValido(examenMedicoSchema, {
      tipo_examen_medico_id: 0,
      paciente_id: 1,
    })).resolves.toBe(false);
  });

  test("paciente_id negativo -> inválido", async () => {
    await expect(esValido(examenMedicoSchema, {
      tipo_examen_medico_id: 1,
      paciente_id: -1,
    })).resolves.toBe(false);
  });
});
