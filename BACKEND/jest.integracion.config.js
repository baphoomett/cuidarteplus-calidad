// Pruebas de integración: API real + PostgreSQL real (docker compose up -d).
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/integracion"],
  testTimeout: 60000,
};
