/**
 * CP-FE-07 Gestión de pacientes: listado, eliminación, registro y edición.
 */
import { screen, waitFor, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { api } from "../../src/lib/api";
import { renderCon } from "../helpers/render";
import PacientesList from "../../src/pages/pacientes/PacientesList";
import PacienteForm from "../../src/pages/pacientes/PacienteForm";
import PacientesTabCreate from "../../src/pages/pacientes/PacientesTabCreate";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() }, Toaster: () => null }));

const PACIENTES = [
  { id: 1, rut: "11111111-1", primer_nombre: "juan", apellido_paterno: "Pérez", apellido_materno: "Gómez", email: "j@c.cl", telefono: "+569", fecha_nacimiento: "1985-03-14T00:00:00Z" },
  { id: 2, rut: "16789456-K" },
];

const COMPLETO = {
  rut: "12.345.678-5",
  primer_nombre: "Ana",
  apellido_paterno: "Rojas",
  apellido_materno: "Soto",
  fecha_nacimiento: "1990-05-01",
  sexo: "F",
  nacionalidad: "Chilena",
  estado_civil: "soltero",
  email: "ana@c.cl",
  telefono: "+56911111111",
  direccion: "Calle 1",
  contacto_emergencia_nombre: "Pedro",
  contacto_emergencia_telefono: "+56922222222",
  contacto_emergencia_relacion: "Hermano",
  tipo_prevision: "Fonasa",
  tiene_convenio: true,
  grupo_sanguineo: "O+",
  alergias: "Ninguna",
  enfermedades_cronicas: "Ninguna",
  discapacidades: "Ninguna",
  observaciones_medicas_generales: "Sin observaciones",
};

const campo = (container, nombre) => container.querySelector(`[name="${nombre}"]`);

describe("CP-FE-07.A Listado de pacientes", () => {
  test("CP-FE-07.1 muestra indicador de carga y luego la tabla con los datos formateados", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: PACIENTES });
    renderCon(<PacientesList />, { rol: "admin" });
    expect(screen.getByText("Cargando pacientes...")).toBeInTheDocument();
    expect(await screen.findByText("juan Pérez Gómez")).toBeInTheDocument();
    expect(screen.getByText("J")).toBeInTheDocument();
    expect(screen.getByText("P")).toBeInTheDocument();
    expect(screen.getByText(new Date(PACIENTES[0].fecha_nacimiento).toLocaleDateString("es-CL"))).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(3);
  });

  test("CP-FE-07.2 respuesta vacía o error de la API dejan la tabla vacía", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: null });
    renderCon(<PacientesList />, { rol: "admin" });
    expect(await screen.findByText("Gestión de Pacientes")).toBeInTheDocument();

    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(api, "get").mockRejectedValueOnce(new Error("500"));
    renderCon(<PacientesList />, { rol: "admin" });
    await waitFor(() => expect(err).toHaveBeenCalledWith("Error al cargar pacientes:", expect.any(Error)));
  });

  test("CP-FE-07.3 el botón editar abre el formulario del paciente", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: PACIENTES });
    renderCon(<PacientesList />, { rol: "medico" });
    await userEvent.click(await screen.findByTestId("button-cliente-editar-1"));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/pacientes/1/editar");
  });

  test("CP-FE-07.4 el administrador confirma la eliminación y la lista se recarga", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: PACIENTES });
    const del = vi.spyOn(api, "delete").mockResolvedValue({ data: { deleted: true } });
    renderCon(<PacientesList />, { rol: "admin" });
    await userEvent.click(await screen.findByTestId("button-cliente-eliminar-1"));
    const dialogo = await screen.findByRole("dialog");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/pacientes/1"));
    expect(toast.success).toHaveBeenCalledWith("Paciente eliminado");
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  test("USA-FE-02 el diálogo de eliminación muestra el nombre del paciente", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: PACIENTES });
    renderCon(<PacientesList />, { rol: "admin" });
    await userEvent.click(await screen.findByTestId("button-cliente-eliminar-1"));
    const dialogo = await screen.findByRole("dialog");
    // Hallazgo: se usa row.original.nombre (inexistente) y el nombre queda en blanco.
    expect(within(dialogo).getByText(/deseas eliminar al paciente/)).toHaveTextContent("juan");
  });

  test("CP-FE-07.5 cancelar la eliminación no llama a la API", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: PACIENTES });
    const del = vi.spyOn(api, "delete");
    renderCon(<PacientesList />, { rol: "admin" });
    await userEvent.click(await screen.findByTestId("button-cliente-eliminar-2"));
    const dialogo = await screen.findByRole("dialog");
    const eliminar = within(dialogo).getByRole("button", { name: "Eliminar" });
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    // Durante la animación de cierre el botón sigue montado: confirmar sin selección no hace nada
    fireEvent.click(eliminar);
    expect(del).not.toHaveBeenCalled();
  });

  test("USA-FE-03 un médico que intenta eliminar recibe retroalimentación (no un silencio)", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: PACIENTES });
    const del = vi.spyOn(api, "delete");
    renderCon(<PacientesList />, { rol: "medico" });
    await userEvent.click(await screen.findByTestId("button-cliente-eliminar-1"));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Eliminar" }));
    expect(del).not.toHaveBeenCalled();
    // Hallazgo: el botón se muestra al médico, pero la acción se ignora sin aviso.
    expect(toast.error).toHaveBeenCalled();
  });

  test("CP-FE-07.6 al registrar un paciente vuelve a la pestaña de listado y recarga", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: PACIENTES });
    vi.spyOn(api, "post").mockResolvedValue({ data: { id: 3 } });
    const { container } = renderCon(<PacientesList />, { rol: "medico" });
    await userEvent.click(await screen.findByRole("tab", { name: /Registrar Paciente/ }));
    expect(screen.getByText("Registrar nuevo paciente")).toBeInTheDocument();
    for (const [k, v] of Object.entries({ rut: "12345678-5", primer_nombre: "Ana", apellido_paterno: "Rojas", fecha_nacimiento: "1990-05-01", email: "ana@c.cl" })) {
      fireEvent.change(campo(container, k), { target: { value: v } });
    }
    fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
    await userEvent.click(await screen.findByRole("option", { name: "Femenino" }));
    await userEvent.click(screen.getByRole("button", { name: "Registrar Paciente" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Paciente registrado exitosamente"));
    expect(await screen.findByRole("tab", { name: /Listar Pacientes/, selected: true })).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("CP-FE-07.B Formulario de paciente (PacientesTabCreate)", () => {
  test("CP-FE-07.7 enviar el formulario vacío muestra los errores de los campos obligatorios", async () => {
    const post = vi.spyOn(api, "post");
    const { container } = renderCon(<PacientesTabCreate onSuccess={vi.fn()} />);
    // Se omite la validación nativa del navegador (atributo required) para probar la de Formik/yup
    fireEvent.submit(container.querySelector("form"));
    expect(await screen.findByText("El RUT es requerido")).toBeInTheDocument();
    expect(screen.getByText("El primer nombre es requerido")).toBeInTheDocument();
    expect(screen.getByText("El email es requerido")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test("CP-FE-07.8 el RUT se formatea al salir del campo y se envía normalizado", async () => {
    let resolver;
    const post = vi.spyOn(api, "post").mockReturnValue(new Promise((r) => (resolver = r)));
    const onSuccess = vi.fn();
    const { container } = renderCon(<PacientesTabCreate onSuccess={onSuccess} initialValues={{ ...COMPLETO, rut: "" }} />);
    const rut = campo(container, "rut");
    fireEvent.change(rut, { target: { value: "123456785" } });
    fireEvent.blur(rut);
    await waitFor(() => expect(rut).toHaveValue("12.345.678-5"));
    await userEvent.click(screen.getByRole("button", { name: "Registrar Paciente" }));
    expect(await screen.findByRole("button", { name: "Registrando..." })).toBeDisabled();
    await act(async () => resolver({ data: {} }));
    expect(post).toHaveBeenCalledWith("/pacientes", expect.objectContaining({ rut: "12345678-5" }));
    expect(onSuccess).toHaveBeenCalled();
    expect(rut).toHaveValue("");
  });

  test("CP-FE-07.9 se pueden completar selects, casilla de convenio y campos médicos", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    const { container } = renderCon(<PacientesTabCreate onSuccess={vi.fn()} initialValues={{ ...COMPLETO, tiene_convenio: false }} />);
    const combos = screen.getAllByRole("combobox");
    fireEvent.mouseDown(combos[1]);
    await userEvent.click(await screen.findByRole("option", { name: "Casado" }));
    fireEvent.mouseDown(combos[2]);
    await userEvent.click(await screen.findByRole("option", { name: "AB-" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Tiene Convenio" }));
    fireEvent.change(campo(container, "alergias"), { target: { value: "Polen" } });
    await userEvent.click(screen.getByRole("button", { name: "Registrar Paciente" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/pacientes",
        expect.objectContaining({ estado_civil: "casado", grupo_sanguineo: "AB-", tiene_convenio: true, alergias: "Polen" })
      )
    );
  });

  test("CP-FE-07.10 si la API falla el formulario se rehabilita y no se llama onSuccess", async () => {
    vi.spyOn(api, "post").mockRejectedValue(new Error("400"));
    const onSuccess = vi.fn();
    renderCon(<PacientesTabCreate onSuccess={onSuccess} initialValues={COMPLETO} />);
    await userEvent.click(screen.getByRole("button", { name: "Registrar Paciente" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Registrar Paciente" })).toBeEnabled());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test("CP-FE-07.11 Cancelar vuelve al listado de pacientes", async () => {
    renderCon(<PacientesTabCreate onSuccess={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/pacientes");
  });
});

describe("CP-FE-07.C Edición de paciente (PacienteForm)", () => {
  test("CP-FE-07.12 carga los datos del paciente, los actualiza y vuelve al listado", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { ...COMPLETO, fecha_nacimiento: "1990-05-01T00:00:00.000Z" } });
    let resolver;
    const put = vi.spyOn(api, "put").mockReturnValue(new Promise((r) => (resolver = r)));
    const { container } = renderCon(<PacienteForm />, { ruta: "/pacientes/5/editar", path: "/pacientes/:id/editar" });
    expect(screen.getByText("Cargando...")).toBeInTheDocument();
    expect(await screen.findByText("Editar paciente")).toBeInTheDocument();
    expect(campo(container, "fecha_nacimiento")).toHaveValue("1990-05-01");
    await userEvent.click(screen.getByRole("button", { name: "Actualizar Paciente" }));
    expect(await screen.findByRole("button", { name: "Actualizando..." })).toBeDisabled();
    await act(async () => resolver({ data: {} }));
    expect(put).toHaveBeenCalledWith("/pacientes/5", expect.objectContaining({ rut: "12345678-5" }));
    expect(toast.success).toHaveBeenCalledWith("Paciente actualizado exitosamente");
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/pacientes");
  });

  test("USA-FE-04 el encabezado de edición se refiere a 'paciente' (no a 'cliente')", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: {} });
    renderCon(<PacienteForm />, { ruta: "/pacientes/5/editar", path: "/pacientes/:id/editar" });
    expect(await screen.findByText("Editar paciente")).toBeInTheDocument();
    // Hallazgo: el título dice "Editar Cliente" (texto heredado de otro sistema).
    expect(screen.queryByText("Editar Cliente")).toBeNull();
  });

  test("CP-FE-07.13 una ficha con campos vacíos se carga con valores por defecto", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: {} });
    const { container } = renderCon(<PacienteForm />, { ruta: "/pacientes/5/editar", path: "/pacientes/:id/editar" });
    await screen.findByText("Editar paciente");
    expect(campo(container, "rut")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "Tiene Convenio" })).not.toBeChecked();
  });

  test("CP-FE-07.14 si el paciente no existe muestra error y vuelve al listado", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("404"));
    renderCon(<PacienteForm />, { ruta: "/pacientes/99/editar", path: "/pacientes/:id/editar" });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Error al cargar paciente"));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/pacientes");
  });

  test("CP-FE-07.15 sin :id se muestra el formulario de registro vacío", async () => {
    const get = vi.spyOn(api, "get");
    vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    const { container } = renderCon(<PacienteForm />, { ruta: "/pacientes/nuevo" });
    expect(screen.getByText("Registrar nuevo paciente")).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
    for (const [k, v] of Object.entries({ rut: "12345678-5", primer_nombre: "Ana", apellido_paterno: "Rojas", fecha_nacimiento: "1990-05-01", email: "ana@c.cl" })) {
      fireEvent.change(campo(container, k), { target: { value: v } });
    }
    fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
    await userEvent.click(await screen.findByRole("option", { name: "Masculino" }));
    await userEvent.click(screen.getByRole("button", { name: "Registrar Paciente" }));
    await waitFor(() => expect(screen.getByTestId("ubicacion")).toHaveTextContent("/pacientes"));
  });
});
