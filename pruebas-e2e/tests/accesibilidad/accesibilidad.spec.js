const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

test("la página de login no tiene problemas críticos de accesibilidad", async ({
  page,
}) => {
  await page.goto("/login");

  const resultado = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  for (const violation of resultado.violations) {
    console.log(
      `[${violation.impact}] ${violation.id}: ${violation.help} (${violation.nodes.length} elementos)`
    );
  }

  const graves = resultado.violations.filter(
    (violation) => violation.impact === "critical"
  );
  expect(graves).toEqual([]);
});
