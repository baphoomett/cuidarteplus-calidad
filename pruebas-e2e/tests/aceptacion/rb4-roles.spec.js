const { test, expect } = require("@playwright/test");
const { iniciarSesion } = require("../apoyo");

test("CA-RB5: el administrador ve la opción de eliminar pacientes", async ({
  page,
}) => {
  await iniciarSesion(page, "admin", "admin");
  await expect(page).toHaveURL(/\/home/);
  await page.goto("/pacientes");

  await expect(
    page.locator('[data-testid^="button-cliente-eliminar-"]').first()
  ).toBeVisible({ timeout: 15000 });
});

test("CA-RB4: el médico no ve la opción de eliminar pacientes", async ({
  page,
}) => {
  await iniciarSesion(page, "medico", "medico");
  await expect(page).toHaveURL(/\/home/);
  await page.goto("/pacientes");

  await expect(
    page.locator('[data-testid^="button-cliente-editar-"]').first()
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.locator('[data-testid^="button-cliente-eliminar-"]')
  ).toHaveCount(0);
});
