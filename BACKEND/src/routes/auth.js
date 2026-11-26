const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");
const validate = require("../middleware/validate");
const { loginSchema, registerSchema } = require("../validations/auth");
const { normalizeRut } = require("../utils/rut");
const { getJwtSecret } = require("../utils/jwt");
const { hashPassword, isPasswordHash, verifyPassword } = require("../utils/passwords");
const router = express.Router();
const JWT_SECRET = getJwtSecret();
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function getAttemptRecord(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now - record.startedAt >= LOGIN_WINDOW_MS) {
    const freshRecord = { startedAt: now, count: 0 };
    loginAttempts.set(ip, freshRecord);
    return freshRecord;
  }
  return record;
}

router.post("/login", validate(loginSchema), async (req, res) => {
  const { nombre_usuario, password } = req.body;
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const attempts = getAttemptRecord(ip);
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    return res.status(429).json({ error: "Demasiados intentos; inténtelo más tarde" });
  }

  try {
    const result = await pool.query(
      "SELECT id, nombre_usuario, contrasena, correo FROM usuarios WHERE nombre_usuario = $1",
      [nombre_usuario]
    );
    if (result.rows.length === 0) {
      attempts.count += 1;
      return res.status(401).json({ error: "Credenciales inválidas" });
    }
    const user = result.rows[0];
    if (!(await verifyPassword(password, user.contrasena))) {
      attempts.count += 1;
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    if (!isPasswordHash(user.contrasena)) {
      const upgradedPassword = await hashPassword(password);
      await pool.query(
        "UPDATE usuarios SET contrasena = $1 WHERE id = $2 AND contrasena = $3",
        [upgradedPassword, user.id, user.contrasena]
      );
    }

    loginAttempts.delete(ip);

    // Obtener roles del usuario
    const rolesResult = await pool.query(
      `SELECT r.id, r.nombre 
       FROM usuario_roles ur
       JOIN roles r ON r.id = ur.rol_id
       WHERE ur.usuario_id = $1`,
      [user.id]
    );
    const roles = rolesResult.rows.map(r => ({ id: r.id, nombre: r.nombre }));
    const rolNombre = roles.length > 0 ? roles[0].nombre : null;
    const rolId = roles.length > 0 ? roles[0].id : null;

    // Obtener paciente asociado si existe
    const pacienteResult = await pool.query(
      "SELECT id FROM pacientes WHERE usuario_id = $1",
      [user.id]
    );
    const pacienteId = pacienteResult.rows.length > 0 ? pacienteResult.rows[0].id : null;

    const token = jwt.sign(
      { 
        usuarioId: user.id, 
        nombreUsuario: user.nombre_usuario,
        rolId: rolId,
        rolNombre: rolNombre,
        pacienteId: pacienteId,
        roles: roles
      },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    await pool.query(
      "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)",
      [user.id, "LOGIN: usuario inició sesión"]
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Error en login", glosa: "Error interno del servidor" });
  }
});

router.post("/registro", validate(registerSchema), async (req, res) => {
  const { nombre_usuario, password, correo, rut } = req.body;
  try {
    // Normalizar RUT antes de procesar
    const normalizedRut = rut ? normalizeRut(rut) : null;
    
    // Never link an account to an existing clinical record without verifying identity.
    if (normalizedRut) {
      const rutCheck = await pool.query(
        "SELECT id, usuario_id FROM pacientes WHERE rut = $1",
        [normalizedRut]
      );
      if (rutCheck.rows.length > 0) {
        return res.status(400).json({
          error: "RUT ya registrado",
          glosa: "No se puede asociar una ficha clínica existente sin verificar la identidad",
        });
      }
    }

    // Verificar que el nombre de usuario y correo no estén duplicados
    const usuarioCheck = await pool.query(
      "SELECT id FROM usuarios WHERE nombre_usuario = $1 OR correo = $2",
      [nombre_usuario, correo]
    );
    if (usuarioCheck.rows.length > 0) {
      return res.status(400).json({
        error: "Usuario o correo duplicado",
        glosa: "El nombre de usuario o correo electrónico ya está en uso",
      });
    }

    // Crear usuario
    const hashedPassword = await hashPassword(password);
    const userResult = await pool.query(
      "INSERT INTO usuarios (nombre_usuario, contrasena, correo) VALUES ($1, $2, $3) RETURNING id, nombre_usuario, correo, created_at",
      [nombre_usuario, hashedPassword, correo]
    );
    const user = userResult.rows[0];

    // Asignar rol de paciente
    const rolPacienteResult = await pool.query(
      "SELECT id FROM roles WHERE nombre = 'paciente'"
    );
    if (rolPacienteResult.rows.length > 0) {
      await pool.query(
        "INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)",
        [user.id, rolPacienteResult.rows[0].id]
      );
    }

    // Si se proporciona un RUT nuevo, crear la ficha básica del paciente.
    if (normalizedRut) {
      await pool.query(
        `INSERT INTO pacientes (rut, primer_nombre, apellido_paterno, email, fecha_nacimiento, sexo, usuario_id)
         VALUES ($1, $2, $3, $4, '2000-01-01', 'M', $5)`,
        [normalizedRut, nombre_usuario, "", correo, user.id]
      );
    }

    await pool.query(
      "INSERT INTO auditoria (usuario_id, accion) VALUES ($1, $2)",
      [user.id, "REGISTRO: nuevo usuario registrado"]
    );

    res.status(201).json({
      message: "Usuario registrado exitosamente",
      usuario: user,
    });
  } catch (err) {
    console.error(err);
    if (err.code === "23505") {
      return res.status(400).json({
        error: "Error al registrar",
        glosa: "El nombre de usuario o correo ya existe",
      });
    }
    res.status(500).json({
      error: "Error al registrar",
      glosa: "Error interno del servidor",
    });
  }
});

router.resetLoginAttempts = () => loginAttempts.clear();

module.exports = router;
