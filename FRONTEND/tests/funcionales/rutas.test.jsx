/**
 * CP-FE-02 Enrutamiento de la aplicación (App.jsx).
 * Las páginas se reemplazan por marcadores para verificar solo qué ruta
 * monta qué pantalla y qué guardas se aplican.
 */
import { screen } from "@testing-library/react";
import { renderCon } from "../helpers/render";
import App from "../../src/App";

const { stub } = vi.hoisted(() => ({
  stub: (nombre) => ({ default: () => <div>pantalla:{nombre}</div> }),
}));
vi.mock("../../src/components/Layout", async () => {
  const { Outlet } = await import("react-router-dom");
  return { default: () => <div>layout<Outlet /></div> };
});
vi.mock("../../src/pages/auth/Login", () => stub("login"));
vi.mock("../../src/pages/auth/Register", () => stub("registro"));
vi.mock("../../src/pages/Home", () => stub("home"));
vi.mock("../../src/pages/pacientes/PacientesList", () => stub("pacientes"));
vi.mock("../../src/pages/pacientes/PacienteForm", () => stub("paciente-form"));
vi.mock("../../src/pages/examenes/ExamenesList", () => stub("examenes"));
vi.mock("../../src/pages/examenes/ExamenDetalle", () => stub("examen-detalle"));
vi.mock("../../src/pages/examenes/MisResultados", () => stub("mis-resultados"));
vi.mock("../../src/pages/auditoria/AuditoriaList", () => stub("auditoria"));
vi.mock("../../src/pages/usuarios/UsuariosList", () => stub("usuarios"));
vi.mock("../../src/pages/usuarios/UsuarioForm", () => stub("usuario-form"));
vi.mock("../../src/pages/informacion/PoliticaPrivacidad", () => stub("privacidad"));
vi.mock("../../src/pages/informacion/TerminosUso", () => stub("terminos"));
vi.mock("../../src/pages/informacion/AcercaDe", () => stub("acerca"));
vi.mock("../../src/pages/informacion/Ayuda", () => stub("ayuda"));

describe("CP-FE-02 Rutas", () => {
  test.each([
    ["/login", null, "login"],
    ["/registro", null, "registro"],
    ["/", "medico", "home"],
    ["/home", "medico", "home"],
    ["/pacientes", "medico", "pacientes"],
    ["/pacientes/nuevo", "medico", "paciente-form"],
    ["/pacientes/3/editar", "medico", "paciente-form"],
    ["/examenes", "medico", "examenes"],
    ["/examenes/4", "paciente", "examen-detalle"],
    ["/mis-resultados", "paciente", "mis-resultados"],
    ["/auditoria", "admin", "auditoria"],
    ["/usuarios", "admin", "usuarios"],
    ["/usuarios/2/editar", "medico", "usuario-form"],
    ["/politica-privacidad", "paciente", "privacidad"],
    ["/terminos-uso", "paciente", "terminos"],
    ["/acerca-de", "paciente", "acerca"],
    ["/ayuda", "paciente", "ayuda"],
  ])("CP-FE-02.1 %s (%s) muestra la pantalla %s", (ruta, rol, pantalla) => {
    renderCon(<App />, { ruta, rol });
    expect(screen.getByText(`pantalla:${pantalla}`)).toBeInTheDocument();
  });

  test("CP-FE-02.2 rutas protegidas sin sesión redirigen a /login", () => {
    renderCon(<App />, { ruta: "/pacientes", rol: null });
    expect(screen.getByText("pantalla:login")).toBeInTheDocument();
  });

  test("CP-FE-02.3 una ruta inexistente redirige a /login", () => {
    renderCon(<App />, { ruta: "/no-existe", rol: "admin" });
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/login");
  });

  test("CP-FE-02.4 un médico no puede abrir la auditoría ni el listado de usuarios", () => {
    renderCon(<App />, { ruta: "/auditoria", rol: "medico" });
    expect(screen.getByText("No autorizado (solo administrador).")).toBeInTheDocument();
  });
});
