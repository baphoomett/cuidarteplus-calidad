/**
 * CP-FE-09 Gestión de usuarios y edición de cuenta · CP-FE-10 Auditoría
 */
import { screen, waitFor, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { api } from "../../src/lib/api";
import { renderCon } from "../helpers/render";
import UsuariosList from "../../src/pages/usuarios/UsuariosList";
import UsuariosTabList from "../../src/pages/usuarios/UsuariosTabList";
import UsuariosTabCreate from "../../src/pages/usuarios/UsuariosTabCreate";
import UsuarioForm from "../../src/pages/usuarios/UsuarioForm";
import AuditoriaList from "../../src/pages/auditoria/AuditoriaList";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() }, Toaster: () => null }));

const USUARIOS = [
  { id: 1, nombre_usuario: "admin", correo: "admin@c.cl", rol_nombre: "admin", created_at: "2026-01-01T10:00:00Z" },
  { id: 2, nombre_usuario: "medico", correo: "medico@c.cl", rol: "medico" },
  { id: 3, correo: "x@c.cl" },
];
const ROLES = [
  { id: 1, nombre: "admin" },
  { id: 2, nombre: "medico" },
  { id: 3, nombre: "paciente" },
  { id: 4, nombre: "administrador" },
  { id: 5, nombre: "contador" },
];

function mockGet(mapa) {
  return vi.spyOn(api, "get").mockImplementation((url) => {
    const r = mapa[url];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve({ data: r });
  });
}
const campo = (c, n) => c.querySelector(`[name="${n}"]`);

describe("CP-FE-09.A Listado de usuarios", () => {
  test("CP-FE-09.1 el administrador ve todos los usuarios con rol, avatar y acciones", async () => {
    mockGet({ "/usuarios": USUARIOS });
    renderCon(<UsuariosList />, { rol: "admin" });
    expect(await screen.findByText("admin@c.cl")).toBeInTheDocument();
    expect(screen.getByText("U")).toBeInTheDocument();
    expect(screen.getByTestId("button-usuario-editar-3")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Crear Usuario/ })).toBeInTheDocument();
  });

  test("USA-FE-05 la fecha de creación se muestra en un formato legible", async () => {
    mockGet({ "/usuarios": USUARIOS });
    renderCon(<UsuariosList />, { rol: "admin" });
    await screen.findByText("admin@c.cl");
    // Hallazgo: se muestra el timestamp ISO crudo de la base de datos.
    expect(screen.queryByText("2026-01-01T10:00:00Z")).toBeNull();
  });

  test("CP-FE-09.2 respuesta vacía deja la tabla sin filas", async () => {
    mockGet({ "/usuarios": null });
    renderCon(<UsuariosList />, { rol: "administrador" });
    expect(await screen.findByText("Gestión de Usuarios")).toBeInTheDocument();
  });

  test("CP-FE-09.3 el administrador elimina un usuario tras confirmar", async () => {
    const get = mockGet({ "/usuarios": USUARIOS });
    const del = vi.spyOn(api, "delete").mockResolvedValue({});
    renderCon(<UsuariosList />, { rol: "admin" });
    await userEvent.click(await screen.findByTestId("button-usuario-eliminar-2"));
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("medico");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/usuarios/2"));
    expect(toast.success).toHaveBeenCalledWith("Usuario eliminado");
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  test("CP-FE-09.4 cancelar la eliminación no llama a la API y editar navega al formulario", async () => {
    mockGet({ "/usuarios": USUARIOS });
    const del = vi.spyOn(api, "delete");
    renderCon(<UsuariosList />, { rol: "admin" });
    await userEvent.click(await screen.findByTestId("button-usuario-eliminar-1"));
    const dialogo = await screen.findByRole("dialog");
    const eliminar = within(dialogo).getByRole("button", { name: "Eliminar" });
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(eliminar);
    expect(del).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getByTestId("button-usuario-editar-1"));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/usuarios/1/editar");
  });

  test("CP-FE-09.5 un rol no administrador ve la lista en solo lectura y no puede eliminar", async () => {
    const onDelete = vi.fn();
    renderCon(<UsuariosTabList items={USUARIOS} onDelete={onDelete} />, { rol: "medico" });
    expect(screen.getAllByText("Solo lectura")).toHaveLength(3);
    expect(screen.queryByTestId("button-usuario-eliminar-1")).toBeNull();
  });

  test("CP-FE-09.6 un 'editor' solo puede editar su propia fila", () => {
    renderCon(<UsuariosTabList items={USUARIOS} onDelete={vi.fn()} />, { rol: "editor", user: { usuarioId: 2 } });
    expect(screen.getByTestId("button-usuario-editar-2")).toBeInTheDocument();
    expect(screen.queryByTestId("button-usuario-editar-1")).toBeNull();
    renderCon(<UsuariosTabList items={USUARIOS} onDelete={vi.fn()} />, { rol: "editor", user: null });
    expect(screen.getAllByText("Solo lectura").length).toBeGreaterThan(0);
  });

  test("CP-FE-09.7 la eliminación de un no administrador se ignora", async () => {
    mockGet({ "/usuarios": USUARIOS });
    const del = vi.spyOn(api, "delete");
    renderCon(<UsuariosList />, { rol: "medico" });
    expect(await screen.findAllByText("Solo lectura")).toHaveLength(3);
    expect(screen.queryByRole("tab", { name: /Crear Usuario/ })).toBeNull();
    expect(del).not.toHaveBeenCalled();
  });

  test("CP-FE-09.8 crear un usuario vuelve a la pestaña de listado y recarga", async () => {
    const get = mockGet({ "/usuarios": USUARIOS, "/roles": ROLES });
    vi.spyOn(api, "post").mockResolvedValue({ data: { id: 9 } });
    const { container } = renderCon(<UsuariosList />, { rol: "admin" });
    await userEvent.click(await screen.findByRole("tab", { name: /Crear Usuario/ }));
    await screen.findByText("Crear nuevo usuario");
    fireEvent.change(campo(container, "nombre_usuario"), { target: { value: "nuevo" } });
    fireEvent.change(campo(container, "correo"), { target: { value: "n@c.cl" } });
    fireEvent.change(campo(container, "contrasena_hash"), { target: { value: "Clave123" } });
    await waitFor(() => expect(campo(container, "rol_id")).toHaveValue("1"));
    await userEvent.click(screen.getByRole("button", { name: "Crear Usuario" }));
    expect(await screen.findByRole("tab", { name: /Listar Usuarios/, selected: true })).toBeInTheDocument();
    expect(get.mock.calls.filter(([u]) => u === "/usuarios")).toHaveLength(2);
  });
});

describe("CP-FE-09.B Crear usuario (UsuariosTabCreate)", () => {
  test("CP-FE-09.9 muestra solo roles válidos con etiquetas legibles y envía el rol elegido", async () => {
    mockGet({ "/roles": ROLES });
    let resolver;
    const post = vi.spyOn(api, "post").mockReturnValue(new Promise((r) => (resolver = r)));
    const onSuccess = vi.fn();
    const onLoad = vi.fn();
    const { container } = renderCon(<UsuariosTabCreate onSuccess={onSuccess} onLoad={onLoad} />);
    await waitFor(() => expect(campo(container, "rol_id")).toHaveValue("1"));
    fireEvent.mouseDown(screen.getByRole("combobox"));
    const opciones = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(opciones).toEqual(["Administrador", "Médico", "Paciente", "Administrador"]);
    await userEvent.click(screen.getByRole("option", { name: "Médico" }));
    fireEvent.change(campo(container, "nombre_usuario"), { target: { value: "doc" } });
    fireEvent.change(campo(container, "correo"), { target: { value: "doc@c.cl" } });
    fireEvent.change(campo(container, "contrasena_hash"), { target: { value: "Clave123" } });
    await userEvent.click(screen.getByRole("button", { name: "Crear Usuario" }));
    expect(await screen.findByRole("button", { name: "Creando..." })).toBeDisabled();
    await act(async () => resolver({}));
    expect(post).toHaveBeenCalledWith("/usuarios", { nombre_usuario: "doc", correo: "doc@c.cl", contrasena_hash: "Clave123", rol_id: 2 });
    expect(toast.success).toHaveBeenCalledWith("Usuario creado exitosamente");
    expect(onLoad).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  test("CP-FE-09.10 valida los campos obligatorios y el botón Limpiar reinicia el formulario", async () => {
    mockGet({ "/roles": [{ id: 2, nombre: "medico" }] });
    const { container } = renderCon(<UsuariosTabCreate onSuccess={vi.fn()} onLoad={vi.fn()} />);
    await waitFor(() => expect(campo(container, "rol_id")).toHaveValue("2"));
    fireEvent.change(campo(container, "correo"), { target: { value: "malo" } });
    fireEvent.submit(container.querySelector("form"));
    expect(await screen.findByText("El nombre de usuario es requerido")).toBeInTheDocument();
    expect(screen.getByText("El correo debe tener un formato válido")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(campo(container, "correo")).toHaveValue("");
    fireEvent.submit(container.querySelector("form"));
    expect(await screen.findByText("El rol es requerido")).toBeInTheDocument();
  });

  test("CP-FE-09.11 sin roles disponibles advierte y deshabilita la creación", async () => {
    mockGet({ "/roles": null });
    renderCon(<UsuariosTabCreate onSuccess={vi.fn()} onLoad={vi.fn()} />);
    expect(await screen.findByText(/No se pudieron cargar los roles/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear Usuario" })).toBeDisabled();
  });

  test("CP-FE-09.12 error al cargar roles o al crear el usuario", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGet({ "/roles": new Error("500") });
    renderCon(<UsuariosTabCreate onSuccess={vi.fn()} onLoad={vi.fn()} />);
    await waitFor(() => expect(err).toHaveBeenCalledWith("Error al cargar roles:", expect.any(Error)));

    mockGet({ "/roles": ROLES });
    vi.spyOn(api, "post").mockRejectedValue(new Error("400"));
    const onSuccess = vi.fn();
    const { container } = renderCon(<UsuariosTabCreate onSuccess={onSuccess} onLoad={vi.fn()} />);
    await waitFor(() => expect(campo(container, "rol_id")).toHaveValue("1"));
    fireEvent.change(campo(container, "nombre_usuario"), { target: { value: "doc" } });
    fireEvent.change(campo(container, "correo"), { target: { value: "doc@c.cl" } });
    fireEvent.change(campo(container, "contrasena_hash"), { target: { value: "Clave123" } });
    fireEvent.submit(container.querySelector("form"));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("CP-FE-09.C Editar usuario / Mi cuenta (UsuarioForm)", () => {
  const montar = (rol, id, mapa, user) => {
    mockGet(mapa);
    return renderCon(<UsuarioForm />, { rol, ruta: `/usuarios/${id}/editar`, path: "/usuarios/:id/editar", user });
  };

  test("CP-FE-09.13 el admin edita otro usuario: nombre, correo y rol", async () => {
    let resolver;
    const put = vi.spyOn(api, "put").mockReturnValue(new Promise((r) => (resolver = r)));
    montar("admin", 2, { "/roles": ROLES, "/usuarios/2": { nombre_usuario: "medico", correo: "m@c.cl", rol_id: 2 } });
    await waitFor(() => expect(screen.getByTestId("input-usuario-nombre")).toHaveValue("medico"));
    expect(screen.getByTestId("input-usuario-nombre")).toBeEnabled();
    fireEvent.mouseDown(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "paciente" }));
    fireEvent.change(screen.getByTestId("input-usuario-correo"), { target: { value: "nuevo@c.cl" } });
    await userEvent.click(screen.getByTestId("button-usuario-actualizar"));
    await waitFor(() => expect(screen.getByTestId("button-usuario-actualizar")).toBeDisabled());
    await act(async () => resolver({}));
    expect(put).toHaveBeenCalledWith("/usuarios/2", { correo: "nuevo@c.cl", nombre_usuario: "medico", rol_id: 3 });
    expect(toast.success).toHaveBeenCalledWith("Información del usuario actualizada");
  });

  test("CP-FE-09.14 el admin no puede cambiar el rol del único administrador ni dejar el nombre vacío", async () => {
    vi.spyOn(api, "put").mockRejectedValue(new Error("400"));
    montar("admin", 5, { "/roles": null, "/usuarios/5": { es_unico_administrador: true } });
    expect(await screen.findByText(/No se puede cambiar el rol del único administrador/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("button-usuario-actualizar"));
    expect(await screen.findByText("El nombre de usuario es requerido")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("input-usuario-nombre"), { target: { value: "jefe" } });
    fireEvent.change(screen.getByTestId("input-usuario-correo"), { target: { value: "jefe@c.cl" } });
    await userEvent.click(screen.getByTestId("button-usuario-actualizar"));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/usuarios/5", { correo: "jefe@c.cl", nombre_usuario: "jefe" }));
  });

  test("CP-FE-09.15 un usuario editando su propia cuenta no puede cambiar nombre ni rol", async () => {
    vi.spyOn(api, "put").mockResolvedValue({});
    montar("medico", 2, { "/roles": ROLES, "/usuarios/2": { nombre_usuario: "medico", correo: "m@c.cl", rol_id: 2 } });
    expect(await screen.findByText("No puedes cambiar tu propio rol")).toBeInTheDocument();
    expect(screen.getByText("Solo los administradores pueden cambiar roles")).toBeInTheDocument();
    expect(screen.getByTestId("input-usuario-nombre")).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId("input-usuario-correo")).toHaveValue("m@c.cl"));
    await userEvent.click(screen.getByTestId("button-usuario-actualizar"));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/usuarios/2", { correo: "m@c.cl" }));
  });

  test("CP-FE-09.16 el administrador editando su propia cuenta tampoco cambia su rol ni su nombre", async () => {
    vi.spyOn(api, "put").mockResolvedValue({});
    montar("admin", 1, { "/roles": ROLES, "/usuarios/1": { nombre_usuario: "admin", correo: "a@c.cl", rol_id: 1 } }, { usuarioId: 1, rolNombre: "administrador" });
    await waitFor(() => expect(screen.getByTestId("input-usuario-correo")).toHaveValue("a@c.cl"));
    await userEvent.click(screen.getByTestId("button-usuario-actualizar"));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/usuarios/1", { correo: "a@c.cl" }));
  });

  test("CP-FE-09.17 cambio de contraseña: valida coincidencia, envía y limpia el formulario", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("500"));
    montar("medico", 2, { "/roles": ROLES, "/usuarios/2": { nombre_usuario: "medico", correo: "m@c.cl" } });
    await screen.findByText("No puedes cambiar tu propio rol");
    fireEvent.change(screen.getByTestId("input-usuario-password"), { target: { value: "Nueva123" } });
    fireEvent.change(screen.getByTestId("input-usuario-confirmar-password"), { target: { value: "Otra123" } });
    await userEvent.click(screen.getByTestId("button-usuario-actualizar-password"));
    expect(await screen.findByText("Las contraseñas no coinciden")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("input-usuario-confirmar-password"), { target: { value: "Nueva123" } });
    await userEvent.click(screen.getByTestId("button-usuario-actualizar-password"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Contraseña actualizada"));
    expect(put).toHaveBeenCalledWith("/usuarios/2", { contrasena_hash: "Nueva123" });
    expect(screen.getByTestId("input-usuario-password")).toHaveValue("");
    fireEvent.change(screen.getByTestId("input-usuario-password"), { target: { value: "Nueva456" } });
    fireEvent.change(screen.getByTestId("input-usuario-confirmar-password"), { target: { value: "Nueva456" } });
    await userEvent.click(screen.getByTestId("button-usuario-actualizar-password"));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
  });

  test("SEG-FE-02 la contraseña nueva exige una política robusta (no solo 6 caracteres)", async () => {
    vi.spyOn(api, "put").mockResolvedValue({});
    montar("medico", 2, { "/roles": ROLES, "/usuarios/2": { nombre_usuario: "medico", correo: "m@c.cl" } });
    await screen.findByText("No puedes cambiar tu propio rol");
    fireEvent.change(screen.getByTestId("input-usuario-password"), { target: { value: "123456" } });
    fireEvent.change(screen.getByTestId("input-usuario-confirmar-password"), { target: { value: "123456" } });
    await userEvent.click(screen.getByTestId("button-usuario-actualizar-password"));
    await new Promise((r) => setTimeout(r, 50));
    // Hallazgo: "123456" es aceptada y enviada al servidor.
    expect(api.put).not.toHaveBeenCalled();
  });

  test("CP-FE-09.18 Volver y Cancelar regresan al listado de usuarios", async () => {
    montar("admin", 2, { "/roles": ROLES, "/usuarios/2": {} });
    await userEvent.click(screen.getByTestId("button-usuario-volver"));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/usuarios");
    montar("admin", 2, { "/roles": ROLES, "/usuarios/2": {} });
    await userEvent.click(screen.getAllByTestId("button-usuario-cancelar")[1]);
    expect(screen.getAllByTestId("ubicacion")[1]).toHaveTextContent("/usuarios");
  });

  test("CP-FE-09.19 error al cargar el usuario muestra un mensaje", async () => {
    montar("admin", 9, { "/roles": new Error("500") });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Error al cargar usuario"));
  });

  test("CP-FE-09.20 sin parámetro :id no se consulta la API", () => {
    const get = mockGet({});
    renderCon(<UsuarioForm />, { rol: "admin" });
    expect(get).not.toHaveBeenCalled();
  });

  describe("cuenta del paciente", () => {
    const FICHA = {
      id: 11, rut: "12345678-5", primer_nombre: "Ana", apellido_paterno: "Rojas", apellido_materno: "Soto",
      fecha_nacimiento: "1990-05-01T00:00:00Z", sexo: "F", nacionalidad: "Chilena", estado_civil: "soltero",
      email: "ana@c.cl", telefono: "+569", direccion: "Calle 1", contacto_emergencia_nombre: "P",
      contacto_emergencia_telefono: "+568", contacto_emergencia_relacion: "Hermano", tipo_prevision: "Fonasa",
      tiene_convenio: true, grupo_sanguineo: "O+", alergias: "No", enfermedades_cronicas: "No", discapacidades: "No",
      observaciones_medicas_generales: "Ok",
    };
    const PAC = { "/roles": ROLES, "/usuarios/7": { nombre_usuario: "paciente", correo: "p@c.cl" }, "/pacientes/11": FICHA };

    test("CP-FE-09.21 el paciente ve 'Mi Cuenta' con su ficha y la actualiza con el RUT normalizado", async () => {
      const put = vi.spyOn(api, "put").mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("400"));
      const { container } = montar("paciente", 7, PAC);
      expect(screen.getAllByText("Editar Mi Cuenta").length).toBe(2);
      expect(await screen.findByText("Información Personal del Paciente")).toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: "Rol" })).toBeNull();
      await waitFor(() => expect(campo(container, "rut")).toHaveValue("12.345.678-5"));
      expect(campo(container, "fecha_nacimiento")).toHaveValue("1990-05-01");

      const rut = campo(container, "rut");
      fireEvent.change(rut, { target: { value: "111111111" } });
      fireEvent.blur(rut);
      await waitFor(() => expect(rut).toHaveValue("11.111.111-1"));
      fireEvent.change(campo(container, "telefono"), { target: { value: "+56999" } });
      await userEvent.click(screen.getByRole("checkbox", { name: "Tiene Convenio" }));
      const combos = screen.getAllByRole("combobox");
      fireEvent.mouseDown(combos[0]);
      await userEvent.click(await screen.findByRole("option", { name: "Otro" }));
      fireEvent.mouseDown(combos[1]);
      await userEvent.click(await screen.findByRole("option", { name: "Viudo" }));
      fireEvent.mouseDown(combos[2]);
      await userEvent.click(await screen.findByRole("option", { name: "B-" }));

      await userEvent.click(screen.getByRole("button", { name: "Actualizar Información del Paciente" }));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Información del paciente actualizada"));
      expect(put).toHaveBeenCalledWith("/pacientes/11", expect.objectContaining({ rut: "11111111-1", telefono: "+56999", tiene_convenio: false, sexo: "O", estado_civil: "viudo", grupo_sanguineo: "B-" }));
      await userEvent.click(screen.getByRole("button", { name: "Actualizar Información del Paciente" }));
      await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    });

    test("SEG-FE-03 el paciente no debería poder modificar su propio RUT desde 'Mi Cuenta'", async () => {
      const { container } = montar("paciente", 7, PAC);
      await waitFor(() => expect(campo(container, "rut")).toHaveValue("12.345.678-5"));
      // Hallazgo: el RUT (identificador clínico) es editable por el propio paciente.
      expect(campo(container, "rut")).toBeDisabled();
    });

    test("CP-FE-09.22 validación de la ficha y botón Volver hacia el inicio", async () => {
      const put = vi.spyOn(api, "put");
      const { container } = montar("paciente", 7, { ...PAC, "/pacientes/11": { id: 11 } });
      await screen.findByText("Información Personal del Paciente");
      expect(campo(container, "rut")).toHaveValue("");
      fireEvent.submit(campo(container, "rut").closest("form"));
      expect(await screen.findByText("El RUT es requerido")).toBeInTheDocument();
      expect(put).not.toHaveBeenCalled();
      await userEvent.click(screen.getByTestId("button-usuario-volver"));
      expect(screen.getByTestId("ubicacion")).toHaveTextContent("/home");
    });

    test("CP-FE-09.23 Cancelar del paciente vuelve al inicio; un error al cargar la ficha se registra", async () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      montar("paciente", 7, { ...PAC, "/pacientes/11": new Error("404") });
      await waitFor(() => expect(err).toHaveBeenCalledWith("Error al cargar datos del paciente:", expect.any(Error)));
      expect(screen.queryByText("Información Personal del Paciente")).toBeNull();
      await userEvent.click(screen.getByTestId("button-usuario-cancelar"));
      expect(screen.getByTestId("ubicacion")).toHaveTextContent("/home");
    });

    test("CP-FE-09.24 un paciente sin ficha asociada no carga datos clínicos", async () => {
      const get = montar("paciente", 7, PAC, { usuarioId: 7, rolNombre: "paciente" }) && api.get;
      await waitFor(() => expect(get).toHaveBeenCalledWith("/usuarios/7"));
      expect(get).not.toHaveBeenCalledWith("/pacientes/11");
    });
  });
});

describe("CP-FE-10 Auditoría", () => {
  test("CP-FE-10.1 lista los eventos con usuario y fecha formateada", async () => {
    mockGet({
      "/auditoria": [
        { id: 3, accion: "LOGIN: usuario inició sesión", nombre_usuario: "admin", fecha_hora: "2026-02-01T10:00:00Z" },
        { id: 2, accion: "ROLES_CREAR", usuario_id: 9, fecha: "2026-02-01T09:00:00Z" },
        { id: 1, accion: "ANÓNIMO" },
      ],
    });
    renderCon(<AuditoriaList />, { rol: "admin" });
    expect(await screen.findByText("#3")).toBeInTheDocument();
    expect(screen.getByText("ID: 9")).toBeInTheDocument();
    expect(screen.getByText("ID: N/A")).toBeInTheDocument();
    expect(screen.getByText("N/A")).toBeInTheDocument();
    expect(screen.getAllByText(/2026/).length).toBe(2);
  });

  test("CP-FE-10.2 respuesta vacía deja la bitácora sin filas", async () => {
    mockGet({ "/auditoria": null });
    renderCon(<AuditoriaList />, { rol: "admin" });
    expect(await screen.findByText("Auditoría")).toBeInTheDocument();
  });
});
