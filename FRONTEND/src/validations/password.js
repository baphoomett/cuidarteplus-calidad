import * as yup from "yup";

export const passwordSchema = (required = true) => {
  let schema = yup.string();
  if (required) schema = schema.required("La contraseña es requerida");

  return schema
    .min(12, "La contraseña debe tener al menos 12 caracteres")
    .max(128, "La contraseña no puede exceder 128 caracteres")
    .matches(/[a-z]/, "La contraseña debe incluir una minúscula")
    .matches(/[A-Z]/, "La contraseña debe incluir una mayúscula")
    .matches(/[0-9]/, "La contraseña debe incluir un número")
    .matches(/[^A-Za-z0-9]/, "La contraseña debe incluir un símbolo")
    .test(
      "not-username",
      "La contraseña no puede ser igual al nombre de usuario",
      function (value) {
        const username = this.parent?.nombre_usuario;
        return !value || !username || value.toLowerCase() !== username.toLowerCase();
      }
    );
};
