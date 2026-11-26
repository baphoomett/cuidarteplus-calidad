const { test, expect } = require("@playwright/test");
const { iniciarSesion } = require("../apoyo");

test("la página de inicio de sesión carga correctamente", async ({ page }) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: "Iniciar Sesión" })
  ).toBeVisible();
});

test("credenciales incorrectas muestran un mensaje y no dan acceso", async ({ page }) => {
  await iniciarSesion(page, "admin", "clave-equivocada");

  await expect(page.getByText("Credenciales inválidas").first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("una ruta protegida sin sesión redirige al login", async ({ page }) => {
  await page.goto("/pacientes");

  await expect(page).toHaveURL(/\/login/);
});
