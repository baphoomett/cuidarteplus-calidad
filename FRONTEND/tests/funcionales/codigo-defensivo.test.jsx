/**
 * CP-FE-11 Código defensivo y configuración.
 *
 * Algunas validaciones internas no se pueden alcanzar desde la interfaz porque
 * otra capa (yup, el filtrado de roles, la visibilidad de botones) ya lo impide.
 * Para verificarlas se aíslan las dependencias: se capturan los callbacks que los
 * componentes entregan a Formik / react-dropzone o a sus componentes hijos y se
 * invocan directamente con los datos límite.
 */
import { screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "../../src/lib/api";
import { renderCon } from "../helpers/render";
import ExamenForm from "../../src/pages/examenes/ExamenForm";
import ExamenDetalle from "../../src/pages/examenes/ExamenDetalle";
import UsuarioForm from "../../src/pages/usuarios/UsuarioForm";
import UsuariosList from "../../src/pages/usuarios/UsuariosList";
import UsuariosTabCreate from "../../src/pages/usuarios/UsuariosTabCreate";
import Home from "../../src/pages/Home";

const capturas = vi.hoisted(() => ({ formik: [], dropzone: [], tabList: null }));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() }, Toaster: () => null }));
vi.mock("formik", async (original) => {
  const real = await original();
  return {
    ...real,
    useFormik: (cfg) => {
      capturas.formik.push(cfg);
      return real.useFormik(cfg);
    },
  };
});
vi.mock("react-dropzone", async (original) => {
  const real = await original();
  return {
    ...real,
    useDropzone: (opts) => {
      capturas.dropzone.push(opts);
      return real.useDropzone(opts);
    },
  };
});
vi.mock("../../src/pages/usuarios/UsuariosTabList", () => ({
  default: (props) => {
    capturas.tabList = props;
    return <div>tabla-usuarios</div>;
  },
}));

beforeEach(() => {
  capturas.formik.length = 0;
  capturas.dropzone.length = 0;
  capturas.tabList = null;
});

function mockGet(mapa) {
  return vi.spyOn(api, "get").mockImplementation((url) => Promise.resolve({ data: mapa[url] }));
}
const ultimo = (lista, pred) => [...lista].reverse().find(pred);

describe("CP-FE-11 Código defensivo", () => {
  test("CP-FE-11.1 ExamenForm no sube documentos pendientes si el examen queda sin paciente", async () => {
    mockGet({ "/tipo-examen": [{ id: 1, nombre: "Hemograma" }], "/pacientes": [{ id: 11, primer_nombre: "Ana", apellido_paterno: "P", rut: "1-9" }] });
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { id: 9 } });
    renderCon(<ExamenForm onSuccess={vi.fn()} />, { rol: "medico" });
    await screen.findByRole("button", { name: "Crear Examen" });

    // Deja un archivo pendiente con un paciente seleccionado...
    fireEvent.mouseDown(screen.getAllByRole("combobox")[1]);
    await userEvent.click(await screen.findByRole("option", { name: /Ana P/ }));
    await act(async () => ultimo(capturas.dropzone, () => true).onDrop([new File(["x"], "a.pdf", { type: "application/pdf" })]));
    expect(await screen.findByText("a.pdf")).toBeInTheDocument();

    // ...y luego se envía con paciente_id vacío (caso que yup impide desde la UI)
    const cfg = ultimo(capturas.formik, (c) => "tipo_examen_medico_id" in c.initialValues);
    await act(async () => cfg.onSubmit({ tipo_examen_medico_id: 1, paciente_id: "" }));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/examenes", { tipo_examen_medico_id: 1, paciente_id: "" });
  });

  test("CP-FE-11.2 ExamenDetalle ignora archivos soltados si el examen no está cargado", async () => {
    mockGet({ "/examenes/1": null, "/documentos/examen/1": [] });
    const post = vi.spyOn(api, "post");
    renderCon(<ExamenDetalle />, { rol: "medico", ruta: "/examenes/1", path: "/examenes/:id" });
    await waitFor(() => expect(screen.queryByText("Cargando examen...")).toBeNull());
    await act(async () => ultimo(capturas.dropzone, () => true).onDrop([new File(["x"], "a.pdf")]));
    expect(post).not.toHaveBeenCalled();
  });

  test("CP-FE-11.3 ExamenDetalle: los diálogos de subida y eliminación se cierran con Escape", async () => {
    mockGet({ "/examenes/1": { id: 1, paciente_id: 1, tipo_examen_nombre: "H", paciente_primer_nombre: "A", paciente_apellido_paterno: "B", created_at: "2026-01-01" }, "/documentos/examen/1": [] });
    renderCon(<ExamenDetalle />, { rol: "admin", ruta: "/examenes/1", path: "/examenes/:id" });
    for (const boton of ["Subir Documento", "Eliminar"]) {
      await userEvent.click(await screen.findByRole("button", { name: boton }));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
  });

  test("CP-FE-11.4 UsuarioForm no envía la ficha clínica si no hay paciente asociado", async () => {
    mockGet({ "/roles": [], "/usuarios/2": {} });
    const put = vi.spyOn(api, "put");
    renderCon(<UsuarioForm />, { rol: "admin", ruta: "/usuarios/2/editar", path: "/usuarios/:id/editar" });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/usuarios/2"));
    const cfg = ultimo(capturas.formik, (c) => "rut" in c.initialValues);
    await act(async () => cfg.onSubmit(cfg.initialValues));
    expect(put).not.toHaveBeenCalled();
  });

  test("CP-FE-11.5 UsuariosList ignora solicitudes de eliminación de un no administrador", async () => {
    mockGet({ "/usuarios": [] });
    const del = vi.spyOn(api, "delete");
    renderCon(<UsuariosList />, { rol: "medico" });
    await screen.findByText("tabla-usuarios");
    await act(async () => capturas.tabList.onDelete(1));
    expect(del).not.toHaveBeenCalled();
  });

  test("CP-FE-11.6 UsuariosTabCreate muestra el nombre crudo de un rol sin etiqueta conocida", async () => {
    // Rol cuyo nombre cambia entre el filtrado y el renderizado (dato inconsistente)
    let lecturas = 0;
    const rolInconsistente = { id: 8, get nombre() { lecturas += 1; return lecturas === 2 ? "medico" : "auditor"; } };
    mockGet({ "/roles": [rolInconsistente] });
    renderCon(<UsuariosTabCreate onSuccess={vi.fn()} onLoad={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('input[name="rol_id"]')).toHaveValue("8"));
    fireEvent.mouseDown(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "auditor" })).toBeInTheDocument();
  });
});

describe("CP-FE-11.B Casos límite adicionales", () => {
  test("CP-FE-11.7 Home trata respuestas vacías de la API como listas vacías", async () => {
    mockGet({ "/examenes": null, "/pacientes": [] });
    renderCon(<Home />, { rol: "medico" });
    expect(await screen.findByText("No hay pacientes atendidos aún")).toBeInTheDocument();
  });

  test("CP-FE-11.8 Home con rol desconocido saluda al usuario por su nombre", async () => {
    mockGet({});
    renderCon(<Home />, { rol: "invitado", user: { nombre_usuario: "visita" } });
    expect(await screen.findByText("visita")).toBeInTheDocument();
  });

  test("CP-FE-11.9 Cancelar en la edición de otro usuario vuelve al listado", async () => {
    mockGet({ "/roles": [], "/usuarios/2": {} });
    renderCon(<UsuarioForm />, { rol: "admin", ruta: "/usuarios/2/editar", path: "/usuarios/:id/editar" });
    await userEvent.click(screen.getByTestId("button-usuario-cancelar"));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent(/^\/usuarios$/);
  });

  test("CP-FE-11.10 sin VITE_API_URL el cliente usa la URL por defecto del backend", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_URL", "");
    const { api: apiNueva } = await import("../../src/lib/api");
    expect(apiNueva.defaults.baseURL).toBe("http://localhost:4444");
    vi.unstubAllEnvs();
  });
});
