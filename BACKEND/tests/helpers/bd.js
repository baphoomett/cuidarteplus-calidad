/**
 * Simulador de PostgreSQL basado en reglas para las pruebas de seguridad.
 *
 * Cada regla es [patrón, respuesta]: la primera cuyo patrón (RegExp) coincida
 * con el SQL ejecutado define el resultado. Así las pruebas no dependen del
 * orden exacto de las consultas y se puede inspeccionar después qué SQL llegó
 * a la base de datos (por ejemplo, para comprobar que un ataque NO la alcanzó).
 */
function simularBD(query, reglas = []) {
  query.mockImplementation(async (sql, params) => {
    for (const [patron, respuesta] of reglas) {
      if (patron.test(sql)) {
        if (respuesta instanceof Error) throw respuesta;
        return typeof respuesta === "function" ? respuesta(sql, params) : respuesta;
      }
    }
    return { rows: [] };
  });
}

/** Devuelve las llamadas a pool.query cuyo SQL coincide con el patrón */
const consultas = (query, patron) =>
  query.mock.calls.filter(([sql]) => patron.test(sql));

module.exports = { simularBD, consultas };
