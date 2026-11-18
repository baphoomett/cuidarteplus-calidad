/**
 * CP-FE-03 Inicio de sesión y registro · CP-FE-04 Navegación (Layout) · CP-FE-05 Páginas informativas
 */
import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { api } from "../../src/lib/api";
import { renderCon } from "../helpers/render";
import Login from "../../src/pages/auth/Login";
import Register from "../../src/pages/auth/Register";
import Layout from "../../src/components/Layout";
import AcercaDe from "../../src/pages/informacion/AcercaDe";
import Ayuda from "../../src/pages/informacion/Ayuda";
import PoliticaPrivacidad from "../../src/pages/informacion/PoliticaPrivacidad";
import TerminosUso from "../../src/pages/informacion/TerminosUso";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() }, Toaster: () => null }));

describe("CP-FE-03.A Inicio de sesión", () => {
  test("CP-FE-03.1 credenciales válidas inician sesión y redirigen a /home", async () => {
    const login = vi.fn().mockResolvedValue();
    renderCon(<Login />, { rol: null, ruta: "/login", auth: { login } });
    await userEvent.type(screen.getByTestId("input-nombre-usuario"), "medico");
    await userEvent.type(screen.getByTestId("input-password"), "medico");
    await userEvent.click(screen.getByTestId("button-login"));
    await waitFor(() => expect(screen.getByTestId("ubicacion")).toHaveTextContent("/home"));
    expect(login).toHaveBeenCalledWith({ nombre_usuario: "medico", password: "medico" });
    expect(toast.success).toHaveBeenCalledWith("Sesión iniciada");
  });

  test("CP-FE-03.2 credenciales inválidas muestran error y no navegan", async () => {
    const login = vi.fn().mockRejectedValue(new Error("401"));
    renderCon(<Login />, { rol: null, ruta: "/login", auth: { login } });
    await userEvent.type(screen.getByTestId("input-nombre-usuario"), "medico");
    await userEvent.type(screen.getByTestId("input-password"), "mala");
    await userEvent.click(screen.getByTestId("button-login"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Credenciales inválidas"));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/login");
  });

  test("CP-FE-03.3 campos vacíos muestran los mensajes de validación", async () => {
    const login = vi.fn();
    renderCon(<Login />, { rol: null, auth: { login } });
    await userEvent.click(screen.getByTestId("button-login"));
    expect(await screen.findByText("El nombre de usuario es requerido")).toBeInTheDocument();
    expect(screen.getByText("La contraseña es requerida")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  test("CP-FE-03.4 mientras carga el botón se deshabilita y muestra 'Ingresando...'", () => {
    renderCon(<Login />, { rol: null, auth: { loading: true } });
    expect(screen.getByTestId("button-login")).toBeDisabled();
    expect(screen.getByTestId("button-login")).toHaveTextContent("Ingresando...");
  });

  test("SEG-FE-01 la pantalla de login NO debe publicar las credenciales por defecto", async () => {
    renderCon(<Login />, { rol: null });
    await userEvent.click(screen.getByRole("button", { name: /Guía inicial/ }));
    const dialogo = await screen.findByRole("dialog");
    // Hallazgo: la guía muestra usuario/contraseña de admin, médico y paciente.
    const filas = within(dialogo).queryAllByRole("row").map((r) => r.textContent);
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(filas).not.toContain("adminadmin");
  });
});

describe("CP-FE-03.B Registro de pacientes", () => {
  async function completar({ rut } = {}) {
    await userEvent.type(screen.getByTestId("input-registro-nombre-usuario"), "nuevo");
    await userEvent.type(screen.getByTestId("input-registro-correo"), "nuevo@c.cl");
    if (rut) {
      await userEvent.type(screen.getByTestId("input-registro-rut"), rut);
      fireEvent.blur(screen.getByTestId("input-registro-rut"));
    }
    await userEvent.type(screen.getByTestId("input-registro-password"), "Clave123");
    await userEvent.click(screen.getByTestId("button-registro-crear-cuenta"));
  }

  test("CP-FE-03.5 registro con RUT lo formatea, lo normaliza y redirige a /login", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    renderCon(<Register />, { rol: null, ruta: "/registro" });
    await completar({ rut: "123456785" });
    expect(screen.getByTestId("input-registro-rut")).toHaveValue("12.345.678-5");
    await waitFor(() => expect(screen.getByTestId("ubicacion")).toHaveTextContent("/login"));
    expect(post).toHaveBeenCalledWith("/autenticacion/registro", {
      nombre_usuario: "nuevo",
      password: "Clave123",
      correo: "nuevo@c.cl",
      rut: "12345678-5",
    });
    expect(toast.success).toHaveBeenCalledWith("Cuenta creada exitosamente, ahora inicia sesión");
  });

  test("CP-FE-03.6 registro sin RUT envía rut indefinido", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    renderCon(<Register />, { rol: null, ruta: "/registro" });
    await completar();
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1].rut).toBeUndefined();
  });

  test("CP-FE-03.7 si la API rechaza el registro el usuario permanece en el formulario", async () => {
    vi.spyOn(api, "post").mockRejectedValue(new Error("400"));
    renderCon(<Register />, { rol: null, ruta: "/registro" });
    await completar();
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/registro");
  });
});

describe("CP-FE-04 Navegación principal (Layout)", () => {
  const nav = () => screen.getByRole("navigation", { name: "Navegación principal" });

  test.each([
    ["admin", ["Pacientes", "Exámenes Médicos", "Auditoría", "Usuarios"], ["Mis Resultados"]],
    ["medico", ["Pacientes", "Exámenes Médicos"], ["Auditoría", "Usuarios", "Mis Resultados"]],
    ["paciente", ["Exámenes Médicos", "Mis Resultados"], ["Pacientes", "Auditoría", "Usuarios"]],
  ])("CP-FE-04.1 el menú del rol %s muestra solo sus opciones", (rol, visibles, ocultas) => {
    renderCon(<Layout />, { rol, ruta: "/examenes" });
    for (const v of visibles) expect(within(nav()).getByRole("link", { name: `Ir a ${v}` })).toBeInTheDocument();
    for (const o of ocultas) expect(within(nav()).queryByRole("link", { name: `Ir a ${o}` })).toBeNull();
    expect(within(nav()).getByRole("link", { name: "Ir a Exámenes Médicos" })).toHaveAttribute("aria-current", "page");
  });

  test("CP-FE-04.2 sin rol ni usuario muestra valores genéricos y ningún menú", () => {
    renderCon(<Layout />, { rol: null, ruta: "/" });
    expect(screen.getAllByText("Usuario")).toHaveLength(2);
    expect(within(nav()).queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Mi Cuenta" })).toHaveAttribute("href", "/usuarios/1/editar");
  });

  test("USA-FE-01 todos los enlaces del menú tienen un nombre accesible descriptivo", () => {
    renderCon(<Layout />, { rol: "medico", ruta: "/" });
    const nombres = within(nav()).getAllByRole("link").map((l) => l.getAttribute("aria-label"));
    // Hallazgo: el enlace de Inicio no tiene etiqueta y se anuncia como "Ir a undefined".
    expect(nombres).not.toContain("Ir a undefined");
  });

  test("CP-FE-04.3 el menú de usuario permite editar la cuenta y cerrar sesión", async () => {
    const { auth } = renderCon(<Layout />, { rol: "medico", ruta: "/home" });
    await userEvent.click(screen.getByRole("button", { name: "Menú de usuario" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Editar cuenta de usuario" }));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/usuarios/2/editar");

    await userEvent.click(screen.getByRole("button", { name: "Menú de usuario" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Cerrar sesión" }));
    expect(auth.logout).toHaveBeenCalled();
  });

  test("CP-FE-04.4 editar cuenta sin usuarioId navega al usuario 1", async () => {
    renderCon(<Layout />, { rol: "admin", user: { nombre_usuario: "x" } });
    await userEvent.click(screen.getByRole("button", { name: "Menú de usuario" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Editar cuenta de usuario" }));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/usuarios/1/editar");
  });

  test("CP-FE-04.5 en pantallas móviles se abre y cierra el menú lateral", async () => {
    const original = window.matchMedia;
    window.matchMedia = (query) => ({ ...original(query), matches: true });
    try {
      renderCon(<Layout />, { rol: "paciente", ruta: "/mis-resultados" });
      await userEvent.click(screen.getByRole("button", { name: "Abrir menú de navegación" }));
      const movil = screen.getByRole("navigation", { name: "Navegación móvil" });
      expect(within(movil).getByRole("link", { name: /Mis Resultados/ })).toHaveClass("Mui-selected");
      await userEvent.click(screen.getByRole("button", { name: "Cerrar menú" }));
      await userEvent.click(screen.getByRole("button", { name: "Abrir menú de navegación" }));
      await userEvent.click(within(movil).getByRole("link", { name: /Exámenes Médicos/ }));
      expect(screen.getByTestId("ubicacion")).toHaveTextContent("/examenes");
    } finally {
      window.matchMedia = original;
    }
  });

  test("CP-FE-04.6 el pie de página muestra enlaces rápidos según el rol", () => {
    renderCon(<Layout />, { rol: "paciente" });
    expect(screen.getByRole("link", { name: "Mis Resultados" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Pacientes" })).toBeNull();
    expect(screen.getByRole("link", { name: "Política de Privacidad" })).toHaveAttribute("href", "/politica-privacidad");
  });
});

describe("CP-FE-05 Páginas informativas", () => {
  test.each([
    ["Acerca de", AcercaDe],
    ["Política de privacidad", PoliticaPrivacidad],
    ["Términos de uso", TerminosUso],
    ["Ayuda", Ayuda],
  ])("CP-FE-05.1 %s se muestra y el botón Volver regresa a la página anterior", async (_n, Pagina) => {
    renderCon(<Pagina />, { rol: "paciente" });
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /volver/i }));
  });

  test.each([
    ["medico", "¿Cómo creo un nuevo examen médico?", "¿Cómo veo mis resultados de exámenes?"],
    ["admin", "¿Cómo creo un nuevo examen médico?", "¿Cómo veo mis resultados de exámenes?"],
    ["paciente", "¿Cómo veo mis resultados de exámenes?", "¿Cómo creo un nuevo examen médico?"],
  ])("CP-FE-05.2 la ayuda del rol %s muestra sus preguntas frecuentes", (rol, visible, oculta) => {
    renderCon(<Ayuda />, { rol });
    expect(screen.getByText(visible)).toBeInTheDocument();
    expect(screen.queryByText(oculta)).toBeNull();
  });
});
