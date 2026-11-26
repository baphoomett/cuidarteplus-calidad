import * as yup from "yup";
import { passwordSchema } from "./password";

export const updateUsuarioSchema = yup.object().shape({
  correo: yup
    .string()
    .required("El correo es requerido")
    .email("El correo debe tener un formato válido")
    .max(255, "El correo no puede exceder 255 caracteres"),
});

export const updatePasswordSchema = yup.object().shape({
  contrasena_hash: passwordSchema(),
  confirmar_contrasena: yup
    .string()
    .required("Debe confirmar la contraseña")
    .oneOf([yup.ref("contrasena_hash")], "Las contraseñas no coinciden"),
});
