/**
 * CP-FE-01 Núcleo de la SPA: cliente HTTP, sesión, guardas de rol, enrutamiento y arranque.
 */
import { render, screen, act, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { toast } from "sonner";
import { api, setAuthToken } from "../../src/lib/api";
import AuthProvider from "../../src/context/AuthContext";
import { useAuth } from "../../src/hooks/useAuth";
import { RequireAuth, RequireAdmin, RequireMedico, RequireAdminOrOwnUser } from "../../src/components/RoleGuard";
import PageHeader from "../../src/components/PageHeader";
import { renderCon } from "../helpers/render";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() }, Toaster: () => null }));

const reqOk = api.interceptors.request.handlers[0].fulfilled;
const reqErr = api.interceptors.request.handlers[0].rejected;
const resOk = api.interceptors.response.handlers[0].fulfilled;
const resErr = api.interceptors.response.handlers[0].rejected;

/** JWT sin firmar con el payload indicado (solo se decodifica en el cliente) */
const jwtCon = (payload) =>
  `x.${btoa(JSON.stringify(payload)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.y`;

describe("CP-FE-01.A Cliente HTTP (lib/api)", () => {
  test("CP-FE-01.1 setAuthToken agrega y elimina la cabecera Authorization por defecto", () => {
    setAuthToken("abc");
    expect(api.defaults.headers.common.Authorization).toBe("Bearer abc");
    setAuthToken(null);
    expect(api.defaults.headers.common.Authorization).toBeUndefined();
  });

  test("CP-FE-01.2 el interceptor adjunta el token guardado salvo en rutas públicas", () => {
    localStorage.setItem("token", "t1");
    expect(reqOk({ url: "/pacientes", headers: {} }).headers.Authorization).toBe("Bearer t1");
    expect(reqOk({ url: "/autenticacion/login", headers: {} }).headers.Authorization).toBeUndefined();
    expect(reqOk({ url: "/public/contratos/1", headers: {} }).headers.Authorization).toBeUndefined();
    expect(reqOk({ headers: {} }).headers.Authorization).toBe("Bearer t1");
  });

  test("CP-FE-01.3 sin token no agrega cabecera (incluye registro de empresas)", () => {
    expect(reqOk({ url: "/empresas", method: "POST", headers: {} }).headers.Authorization).toBeUndefined();
    expect(reqOk({ url: "/empresas", headers: {} }).headers.Authorization).toBeUndefined();
  });

  test("CP-FE-01.4 los errores de configuración de la petición se propagan", async () => {
    await expect(reqErr(new Error("cfg"))).rejects.toThrow("cfg");
  });

  test("CP-FE-01.5 las respuestas exitosas pasan sin cambios", () => {
    const r = { data: 1 };
    expect(resOk(r)).toBe(r);
  });

  test.each([
    ["error + glosa", { response: { data: { error: "E", glosa: "G" } } }, ["E", { description: "G", duration: 5000 }]],
    ["solo error", { response: { data: { error: "E" } } }, ["E"]],
    ["message", { response: { data: { message: "M" } } }, ["M"]],
    ["sin cuerpo", { response: { status: 502, statusText: "Bad Gateway" } }, ["Error: 502 - Bad Gateway"]],
    ["sin statusText", { response: { status: 500, data: {} } }, ["Error: 500 - Error en la petición"]],
    ["sin respuesta (red)", { request: {} }, ["Error de conexión. Verifica tu conexión a internet."]],
    ["error genérico", { message: "boom" }, ["boom"]],
    ["error vacío", {}, ["Ocurrió un error inesperado"]],
  ])("CP-FE-01.6 muestra un toast adecuado para %s y rechaza la promesa", async (_d, error, args) => {
    await expect(resErr(error)).rejects.toBe(error);
    expect(toast.error).toHaveBeenCalledWith(...args);
  });
});

describe("CP-FE-01.B Sesión (AuthContext)", () => {
  function Sonda() {
    const { token, user, role, loading, login, logout } = useAuth();
    return (
      <div>
        <span data-testid="estado">{JSON.stringify({ token, role, loading, nombre: user?.nombre_usuario ?? null })}</span>
        <button onClick={() => login({ nombre_usuario: "medico", password: "medico" }).catch(() => {})}>entrar</button>
        <button onClick={logout}>salir</button>
      </div>
    );
  }
  const estado = () => JSON.parse(screen.getByTestId("estado").textContent);

  test("CP-FE-01.7 login guarda token y usuario decodificado; logout los elimina", async () => {
    const token = jwtCon({ usuarioId: 2, rolNombre: "medico" });
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { token } });
    render(<AuthProvider><Sonda /></AuthProvider>);
    expect(estado()).toEqual({ token: null, role: null, loading: false, nombre: null });

    await act(async () => screen.getByText("entrar").click());
    expect(post).toHaveBeenCalledWith("/autenticacion/login", { nombre_usuario: "medico", password: "medico" });
    expect(estado()).toMatchObject({ token, role: "medico", nombre: "medico" });
    expect(localStorage.getItem("token")).toBe(token);
    expect(api.defaults.headers.common.Authorization).toBe(`Bearer ${token}`);

    act(() => screen.getByText("salir").click());
    expect(estado()).toMatchObject({ token: null, role: null });
    expect(localStorage.getItem("user")).toBeNull();
  });

  test("CP-FE-01.8 token no decodificable: conserva el nombre de usuario sin rol", async () => {
    vi.spyOn(api, "post").mockResolvedValue({ data: { token: "no-es-jwt" } });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AuthProvider><Sonda /></AuthProvider>);
    await act(async () => screen.getByText("entrar").click());
    expect(estado()).toMatchObject({ role: null, nombre: "medico" });
    expect(err).toHaveBeenCalled();
  });

  test("CP-FE-01.9 respuesta sin token y error de red terminan el estado de carga", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: null }).mockRejectedValueOnce(new Error("red"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AuthProvider><Sonda /></AuthProvider>);
    await act(async () => screen.getByText("entrar").click());
    await act(async () => screen.getByText("entrar").click());
    expect(estado().loading).toBe(false);
  });

  test.each([
    [{ rolId: 1 }, "admin"],
    [{ rolId: 2 }, "medico"],
    [{ rolId: 3 }, "paciente"],
    [{ rolId: 9 }, null],
    [{ rolNombre: "admin" }, "admin"],
  ])("CP-FE-01.10 restaura la sesión de localStorage y deduce el rol de %j", (user, rol) => {
    localStorage.setItem("token", "t");
    localStorage.setItem("user", JSON.stringify({ nombre_usuario: "u", ...user }));
    render(<AuthProvider><Sonda /></AuthProvider>);
    expect(estado()).toMatchObject({ token: "t", role: rol });
  });
});

describe("CP-FE-01.C Guardas de rol (RoleGuard)", () => {
  const Ok = () => <div>contenido</div>;

  test("CP-FE-01.11 RequireAuth redirige a /login sin token y deja pasar con token", () => {
    renderCon(<RequireAuth><Ok /></RequireAuth>, { rol: null, ruta: "/pacientes", path: "/pacientes" });
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/login");
    expect(screen.queryByText("contenido")).not.toBeInTheDocument();
    renderCon(<RequireAuth><Ok /></RequireAuth>, { rol: "medico" });
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  test("CP-FE-01.12 RequireAdmin solo permite al administrador", () => {
    renderCon(<RequireAdmin><Ok /></RequireAdmin>, { rol: "medico" });
    expect(screen.getByText("No autorizado (solo administrador).")).toBeInTheDocument();
    renderCon(<RequireAdmin><Ok /></RequireAdmin>, { rol: "admin" });
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  test("CP-FE-01.13 RequireMedico permite médico y admin, no paciente", () => {
    renderCon(<RequireMedico><Ok /></RequireMedico>, { rol: "paciente" });
    expect(screen.getByText("No autorizado (solo médico o administrador).")).toBeInTheDocument();
    renderCon(<RequireMedico><Ok /></RequireMedico>, { rol: "medico" });
    renderCon(<RequireMedico><Ok /></RequireMedico>, { rol: "admin" });
    expect(screen.getAllByText("contenido")).toHaveLength(2);
  });

  test("CP-FE-01.14 RequireAdminOrOwnUser: admin edita a cualquiera, otros solo a sí mismos", () => {
    const montar = (rol, ruta, user) =>
      renderCon(<RequireAdminOrOwnUser><Ok /></RequireAdminOrOwnUser>, { rol, ruta, path: "/usuarios/:id/editar", user });
    montar("admin", "/usuarios/5/editar");
    montar("medico", "/usuarios/2/editar");
    expect(screen.getAllByText("contenido")).toHaveLength(2);
    montar("medico", "/usuarios/5/editar");
    montar(null, "/usuarios/5/editar");
    expect(screen.getAllByText("No autorizado. Solo puedes editar tu propio usuario.")).toHaveLength(2);
  });

  test("CP-FE-01.15 RequireAdminOrOwnUser sin parámetro :id no autoriza a un no-admin", () => {
    renderCon(<RequireAdminOrOwnUser><Ok /></RequireAdminOrOwnUser>, { rol: "medico" });
    expect(screen.getByText(/No autorizado/)).toBeInTheDocument();
  });
});

describe("CP-FE-01.D Componentes y arranque", () => {
  test("CP-FE-01.16 PageHeader muestra título y acciones", () => {
    render(<PageHeader title="Pacientes" actions={<button>Nuevo</button>} />);
    expect(screen.getByRole("heading", { name: "Pacientes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo" })).toBeInTheDocument();
  });

  test("CP-FE-01.17 main.jsx monta la aplicación en #root", async () => {
    vi.resetModules();
    const renderRaiz = vi.fn();
    vi.doMock("react-dom/client", () => ({ createRoot: vi.fn(() => ({ render: renderRaiz })) }));
    document.body.innerHTML = '<div id="root"></div>';
    const { createRoot } = await import("react-dom/client");
    await import("../../src/main.jsx");
    expect(createRoot).toHaveBeenCalledWith(document.getElementById("root"));
    expect(renderRaiz).toHaveBeenCalled();
    vi.doUnmock("react-dom/client");
  });
});
