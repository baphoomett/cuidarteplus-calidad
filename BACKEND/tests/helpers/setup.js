// Entorno controlado: sin secretos ni conexión real salvo que la prueba los defina.
delete process.env.JWT_SECRET;
delete process.env.DATABASE_URL;
delete process.env.PORT;

// Silencia los console.error/log que la API emite en cada error 500 o al iniciar.
beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});
