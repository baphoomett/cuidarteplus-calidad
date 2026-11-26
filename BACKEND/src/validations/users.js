const yup = require("yup");
const { passwordSchema } = require("./password");

const createUserSchema = yup.object().shape({
  nombre_usuario: yup
    .string()
    .required("El nombre de usuario es requerido")
    .min(3, "El nombre de usuario debe tener al menos 3 caracteres")
    .max(50, "El nombre de usuario no puede exceder 50 caracteres"),
  contrasena_hash: passwordSchema(),
  correo: yup
    .string()
    .required("El correo es requerido")
    .email("El correo debe tener un formato válido")
    .max(255, "El correo no puede exceder 255 caracteres"),
  rol_id: yup
    .number()
    .integer("El ID del rol debe ser un número entero")
    .positive("El ID del rol debe ser positivo")
    .optional(),
});

const updateUserSchema = yup.object().shape({
  nombre_usuario: yup
    .string()
    .min(3, "El nombre de usuario debe tener al menos 3 caracteres")
    .max(50, "El nombre de usuario no puede exceder 50 caracteres")
    .optional(),
  contrasena_hash: passwordSchema(false).optional(),
  correo: yup
    .string()
    .email("El correo debe tener un formato válido")
    .max(255, "El correo no puede exceder 255 caracteres")
    .optional(),
  rol_id: yup
    .number()
    .integer("El ID del rol debe ser un número entero")
    .positive("El ID del rol debe ser positivo")
    .optional(),
}).test(
  "at-least-one-field",
  "Debe proporcionar al menos un campo para actualizar",
  function (value) {
    return Object.keys(value).length > 0;
  }
);

module.exports = {
  createUserSchema,
  updateUserSchema,
};
