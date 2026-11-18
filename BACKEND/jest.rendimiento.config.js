// Pruebas de rendimiento: carga con autocannon contra la API levantada en Docker.
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/rendimiento"],
  testTimeout: 180000,
};
