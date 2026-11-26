// Las pruebas usan un secreto exclusivo y no reutilizable en producción.
delete process.env.DATABASE_URL;
delete process.env.PORT;

// Silencia los console.error/log que la API emite en cada error 500 o al iniciar.
beforeEach(() => {
  process.env.JWT_SECRET = "test-only-cuidarteplus-jwt-secret-value-32chars";
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});
