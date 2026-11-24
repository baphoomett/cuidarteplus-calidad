// Datos de conexión usados por las pruebas de Cuidarte+.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:15442/cuidarteplus";
process.env.JWT_SECRET =
  process.env.JWT_SECRET ||
  "inseguro";
