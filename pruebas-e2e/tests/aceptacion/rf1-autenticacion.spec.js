const { test, expect } = require("@playwright/test");
const { iniciarSesion } = require("../apoyo");

test("CA-RF1: un inicio de sesión exitoso muestra el panel", async ({ page }) => {
  // Dado un usuario registrado (admin)
  // Cuando ingresa sus credenciales correctas
  await iniciarSesion(page, "admin", "admin");

  // Entonces entra al panel principal y ve su nombre
  await expect(page).toHaveURL(/\/home/);
  await expect(
    page.getByRole("heading", { name: /Bienvenido,\s*admin/i })
  ).toBeVisible({ timeout: 15000 });
});

test("CA-RF1: cerrar sesión impide volver a páginas protegidas", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "La guía omite el cierre de sesión en el perfil celular");

  // Dado un usuario con sesión iniciada
  await iniciarSesion(page, "admin", "admin");
  await expect(page).toHaveURL(/\/home/);

  // Cuando cierra la sesión
  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();

  // Entonces vuelve al login y ya no puede entrar a páginas protegidas
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/pacientes");
  await expect(page).toHaveURL(/\/login/);
});
