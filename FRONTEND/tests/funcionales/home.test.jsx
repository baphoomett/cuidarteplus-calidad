/**
 * CP-FE-06 Panel de inicio (Home) para médico/admin y paciente.
 */
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "../../src/lib/api";
import { renderCon } from "../helpers/render";
import Home from "../../src/pages/Home";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() }, Toaster: () => null }));

const hoy = new Date().toISOString();
const EXAMENES = [
  { id: 1, paciente_id: 11, tipo_examen_nombre: "Hemograma", created_at: hoy, paciente_primer_nombre: "Ana", paciente_apellido_paterno: "Pérez" },
  { id: 2, paciente_id: 12, tipo_examen_nombre: "Glicemia", created_at: "2020-01-15T10:00:00Z" },
];
const PACIENTES = [
  { id: 11, rut: "11111111-1", primer_nombre: "Ana", apellido_paterno: "Pérez", apellido_materno: "Soto" },
  { id: 12, rut: "22222222-2" },
  { id: 13, rut: "33333333-3", primer_nombre: "Sin", apellido_paterno: "Exámenes" },
];

function mockGet(respuestas) {
  return vi.spyOn(api, "get").mockImplementation((url) => {
    const r = respuestas[url];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve({ data: r });
  });
}

describe("CP-FE-06.A Panel del médico / administrador", () => {
  test("CP-FE-06.1 muestra métricas, últimos pacientes atendidos y navega a su ficha", async () => {
    mockGet({ "/examenes": EXAMENES, "/pacientes": PACIENTES });
    renderCon(<Home />, { rol: "medico" });
    expect(screen.getByText("Cargando información...")).toBeInTheDocument();
    expect(await screen.findByText("Exámenes Cargados")).toBeInTheDocument();

    const valor = (etiqueta) => screen.getByText(etiqueta).previousSibling.textContent;
    expect(valor("Exámenes Cargados")).toBe("2");
    expect(valor("Exámenes de Este Mes")).toBe("1");
    expect(valor("Pacientes Atendidos")).toBe("2");
    expect(valor("Pacientes Totales")).toBe("3");

    expect(screen.getByText("Ana Pérez Soto")).toBeInTheDocument();
    expect(screen.queryByText("Sin Exámenes")).toBeNull();
    await userEvent.click(screen.getByText("RUT: 22222222-2"));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/pacientes/12/editar");
  });

  test("CP-FE-06.2 la pestaña de informes lista los últimos exámenes y abre su detalle", async () => {
    mockGet({ "/examenes": EXAMENES, "/pacientes": PACIENTES });
    renderCon(<Home />, { rol: "admin" });
    await userEvent.click(await screen.findByRole("tab", { name: /Últimos Informes Cargados/ }));
    expect(screen.getByText("Hemograma")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Glicemia"));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/examenes/2");
  });

  test("CP-FE-06.3 sin datos (o con error de la API) muestra mensajes vacíos", async () => {
    mockGet({ "/examenes": new Error("500"), "/pacientes": null });
    renderCon(<Home />, { rol: "medico" });
    expect(await screen.findByText("No hay pacientes atendidos aún")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Últimos Informes Cargados/ }));
    expect(screen.getByText("No hay exámenes cargados aún")).toBeInTheDocument();
  });

  test("CP-FE-06.4 accesos rápidos: cargar examen y editar cuenta", async () => {
    mockGet({ "/examenes": [], "/pacientes": [] });
    renderCon(<Home />, { rol: "medico" });
    await userEvent.click(await screen.findByRole("button", { name: "Cargar Nuevo Examen" }));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/examenes");
    await userEvent.click(screen.getByRole("button", { name: "Editar Cuenta" }));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/usuarios/2/editar");
  });

  test("CP-FE-06.5 un fallo inesperado al cargar se registra y se oculta el indicador de carga", async () => {
    vi.spyOn(api, "get").mockImplementation(() => {
      throw new Error("síncrono");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    renderCon(<Home />, { rol: "admin", user: null });
    expect(await screen.findByText("Exámenes Cargados")).toBeInTheDocument();
    expect(err).toHaveBeenCalledWith("Error al cargar datos:", expect.any(Error));
  });
});

describe("CP-FE-06.B Panel del paciente", () => {
  const MIOS = [
    { id: 5, tipo_examen_nombre: "Perfil lipídico", created_at: "2026-03-10T12:00:00Z" },
    { id: 6, tipo_examen_nombre: null, created_at: "2025-07-01T12:00:00Z" },
  ];

  test("CP-FE-06.6 lista los exámenes del paciente y permite abrirlos", async () => {
    const get = mockGet({ "/examenes/paciente/11": MIOS });
    renderCon(<Home />, { rol: "paciente" });
    expect(await screen.findByText("Últimos Exámenes Cargados")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/examenes/paciente/11");
    await userEvent.click(screen.getByText("Perfil lipídico"));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/examenes/5");
    await userEvent.click(screen.getAllByRole("button", { name: "Ver" })[1]);
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/examenes/6");
  });

  test("CP-FE-06.7 la búsqueda filtra por tipo de examen y por fecha", async () => {
    mockGet({ "/examenes/paciente/11": MIOS });
    renderCon(<Home />, { rol: "paciente" });
    const buscar = await screen.findByPlaceholderText("Buscar por fecha, tipo de examen...");
    fireEvent.change(buscar, { target: { value: "LIPÍD" } });
    expect(screen.getByText("Resultados de Búsqueda")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2);
    fireEvent.change(buscar, { target: { value: new Date(MIOS[1].created_at).toLocaleDateString("es-CL") } });
    expect(screen.getAllByRole("row")).toHaveLength(2);
    fireEvent.change(buscar, { target: { value: "resonancia" } });
    expect(screen.getByText("No se encontraron exámenes con ese criterio")).toBeInTheDocument();
  });

  test("CP-FE-06.8 accesos rápidos del paciente y estado sin exámenes", async () => {
    mockGet({ "/examenes/paciente/11": new Error("red") });
    renderCon(<Home />, { rol: "paciente" });
    expect(await screen.findByText("No hay exámenes cargados aún")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ver Mis Exámenes" }));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/mis-resultados");
    await userEvent.click(screen.getByRole("button", { name: "Editar Cuenta" }));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/usuarios/7/editar");
  });

  test("CP-FE-06.9 respuesta vacía de la API se trata como lista vacía", async () => {
    mockGet({ "/examenes/paciente/11": null });
    renderCon(<Home />, { rol: "paciente" });
    expect(await screen.findByText("No hay exámenes cargados aún")).toBeInTheDocument();
  });

  test("CP-FE-06.10 un paciente sin ficha asociada no consulta exámenes", async () => {
    const get = mockGet({});
    renderCon(<Home />, { rol: "paciente", user: { nombre_usuario: "p" } });
    expect(await screen.findByText("Bienvenido,")).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("CP-FE-06.C Rol desconocido", () => {
  test("CP-FE-06.11 muestra un mensaje genérico sin consultar la API", async () => {
    const get = mockGet({});
    renderCon(<Home />, { rol: "invitado", user: null });
    expect(await screen.findByText("No hay información disponible para tu rol.")).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
});
