/**
 * Pruebas unitarias de los esquemas Yup del backend (src/validations).
 * Verifican reglas de negocio de los datos de entrada.
 */
const { loginSchema, registerSchema } = require("../../src/validations/auth");
const { createUserSchema, updateUserSchema } = require("../../src/validations/users");
const { pacienteSchema, updatePacienteSchema } = require("../../src/validations/pacientes");
const {
  examenMedicoSchema,
  updateExamenMedicoSchema,
} = require("../../src/validations/examenes");
const {
  createEmpresaUsuarioSchema,
  updateEmpresaUsuarioSchema,
} = require("../../src/validations/empresa_usuarios");

const ok = (s, v) => expect(s.isValid(v)).resolves.toBe(true);
const ko = (s, v) => expect(s.isValid(v)).resolves.toBe(false);

const pacienteValido = {
  rut: "12.345.678-5",
  primer_nombre: "Ana",
  apellido_paterno: "Pérez",
  fecha_nacimiento: "1990-05-10",
  sexo: "F",
  email: "ana@correo.cl",
};

describe("Validaciones de autenticación", () => {
  test("CP-01.6 login exige usuario de 3 a 50 caracteres y contraseña", async () => {
    await ok(loginSchema, { nombre_usuario: "admin", password: "x" });
    await ko(loginSchema, { nombre_usuario: "ab", password: "x" });
    await ko(loginSchema, { nombre_usuario: "admin" });
  });

  test("CP-02.6 registro valida correo, contraseña y formato de RUT", async () => {
    const base = { nombre_usuario: "juan", password: "secreto", correo: "j@c.cl" };
    await ok(registerSchema, base);
    await ok(registerSchema, { ...base, rut: "12.345.678-5" });
    await ok(registerSchema, { ...base, rut: "12345678-k" });
    await ko(registerSchema, { ...base, rut: "12345678" });
    await ko(registerSchema, { ...base, correo: "no-es-correo" });
    await ko(registerSchema, { ...base, password: "123" });
  });
});

describe("Validaciones de usuarios", () => {
  test("CP-06.8 creación exige nombre, contraseña y correo; rol opcional positivo", async () => {
    const base = { nombre_usuario: "medico2", contrasena_hash: "abcdef", correo: "m@c.cl" };
    await ok(createUserSchema, base);
    await ok(createUserSchema, { ...base, rol_id: 2 });
    await ko(createUserSchema, { ...base, rol_id: -1 });
    await ko(createUserSchema, { correo: "m@c.cl" });
  });

  test("CP-06.9 actualización exige al menos un campo", async () => {
    await ok(updateUserSchema, { correo: "x@y.cl" });
    await ko(updateUserSchema, {});
  });
});

describe("Validaciones de pacientes", () => {
  test("CP-03.7 creación exige campos obligatorios y dominios válidos", async () => {
    await ok(pacienteSchema, pacienteValido);
    await ok(pacienteSchema, { ...pacienteValido, grupo_sanguineo: "O+", estado_civil: "casado" });
    await ko(pacienteSchema, { ...pacienteValido, sexo: "X" });
    await ko(pacienteSchema, { ...pacienteValido, grupo_sanguineo: "Z" });
    await ko(pacienteSchema, { ...pacienteValido, fecha_nacimiento: "2999-01-01" });
    await ko(pacienteSchema, { ...pacienteValido, rut: "abc" });
  });

  test("CP-03.8 actualización acepta parciales pero no un objeto vacío", async () => {
    await ok(updatePacienteSchema, { telefono: "+56911111111" });
    await ko(updatePacienteSchema, {});
  });
});

describe("Validaciones de exámenes", () => {
  test("CP-04.8 creación exige tipo de examen y paciente positivos", async () => {
    await ok(examenMedicoSchema, { tipo_examen_medico_id: 1, paciente_id: 2 });
    await ko(examenMedicoSchema, { tipo_examen_medico_id: 0, paciente_id: 2 });
    await ko(examenMedicoSchema, { paciente_id: 2 });
    await ko(examenMedicoSchema, {
      tipo_examen_medico_id: 1,
      paciente_id: 2,
      diagnosis: "x".repeat(2001),
    });
  });

  test("CP-04.9 actualización exige al menos un campo", async () => {
    await ok(updateExamenMedicoSchema, { notas: "control" });
    await ko(updateExamenMedicoSchema, {});
  });
});

describe("Validaciones empresa-usuarios (módulo heredado sin uso)", () => {
  test("NF-01.4 exige usuario_id o los datos completos del usuario", async () => {
    await ok(createEmpresaUsuarioSchema, { rol_id: 1, usuario_id: 3 });
    await ok(createEmpresaUsuarioSchema, {
      rol_id: 1,
      nombre_usuario: "pepe",
      contrasena_hash: "123456",
      correo: "p@e.cl",
    });
    await ko(createEmpresaUsuarioSchema, { rol_id: 1 });
  });

  test("NF-01.5 actualización exige empresa, usuario y rol", async () => {
    await ok(updateEmpresaUsuarioSchema, { empresa_id: 1, usuario_id: 1, rol_id: 1 });
    await ko(updateEmpresaUsuarioSchema, { empresa_id: 1 });
  });
});
