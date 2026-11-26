// Pruebas de integración: API real + PostgreSQL real (docker compose up -d).
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/integracion"],
  setupFiles: ["<rootDir>/tests/setup-env.js"],
  testTimeout: 60000,
};
