/**
 * CP-FE-08 Exámenes médicos: listado, creación/edición con documentos, detalle y resultados del paciente.
 */
import { screen, waitFor, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { api } from "../../src/lib/api";
import { renderCon } from "../helpers/render";
import ExamenesList from "../../src/pages/examenes/ExamenesList";
import ExamenesTabList from "../../src/pages/examenes/ExamenesTabList";
import ExamenForm from "../../src/pages/examenes/ExamenForm";
import ExamenDetalle from "../../src/pages/examenes/ExamenDetalle";
import MisResultados from "../../src/pages/examenes/MisResultados";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() }, Toaster: () => null }));

const EXAMENES = [
  { id: 1, tipo_examen_nombre: "Hemograma", paciente_rut: "11111111-1", paciente_primer_nombre: "Ana", paciente_apellido_paterno: "Pérez", paciente_apellido_materno: "Soto", diagnosis: "Normal", created_at: "2026-02-01T10:00:00Z", paciente_id: 11 },
  { id: 2, tipo_examen_nombre: "Glicemia", paciente_rut: "22222222-2" },
];
const TIPOS = [{ id: 1, nombre: "Hemograma" }, { id: 2, nombre: "Glicemia" }];
const PACIENTES = [
  { id: 11, primer_nombre: "Ana", apellido_paterno: "Pérez", apellido_materno: "Soto", rut: "11111111-1" },
  { id: 12, primer_nombre: "Luis", apellido_paterno: "Mora", rut: "22222222-2" },
];
const pdf = (nombre = "resultado.pdf") => new File(["%PDF-1.4"], nombre, { type: "application/pdf" });

/** Simula api.get según la URL; un Error en el mapa se convierte en rechazo */
function mockGet(mapa) {
  return vi.spyOn(api, "get").mockImplementation((url) => {
    const r = typeof mapa === "function" ? mapa(url) : mapa[url];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve({ data: r });
  });
}
const inputArchivo = (container) => container.querySelector('input[type="file"]');
async function elegir(indice, opcion) {
  fireEvent.mouseDown(screen.getAllByRole("combobox")[indice]);
  await userEvent.click(await screen.findByRole("option", { name: opcion }));
}

describe("CP-FE-08.A Listado de exámenes", () => {
  test("CP-FE-08.1 el médico ve la gestión de exámenes con datos del paciente", async () => {
    mockGet({ "/examenes": EXAMENES });
    renderCon(<ExamenesList />, { rol: "medico" });
    expect(screen.getByText("Cargando exámenes...")).toBeInTheDocument();
    expect(await screen.findByText("Gestión de Exámenes Médicos")).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez Soto")).toBeInTheDocument();
    expect(screen.getByText("Normal")).toBeInTheDocument();
    expect(screen.getByText(new Date(EXAMENES[0].created_at).toLocaleDateString("es-CL"))).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Nuevo Examen/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar examen" })).toBeNull();
  });

  test("CP-FE-08.2 el paciente ve 'Mis Exámenes', sin columnas de paciente y solo puede ver detalles", async () => {
    mockGet({ "/examenes": EXAMENES });
    renderCon(<ExamenesList />, { rol: "paciente" });
    expect(await screen.findByText("Mis Exámenes Médicos")).toBeInTheDocument();
    expect(screen.queryByText("RUT Paciente")).toBeNull();
    expect(screen.queryByRole("tab", { name: /Nuevo Examen/ })).toBeNull();
    await userEvent.click(screen.getAllByRole("button", { name: "Ver detalles del examen" })[0]);
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/examenes/1");
  });

  test("CP-FE-08.3 respuesta vacía o error de carga dejan el listado vacío", async () => {
    mockGet({ "/examenes": null });
    renderCon(<ExamenesList />, { rol: "medico" });
    expect(await screen.findByText("Gestión de Exámenes Médicos")).toBeInTheDocument();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGet({ "/examenes": new Error("500") });
    renderCon(<ExamenesList />, { rol: "medico" });
    await waitFor(() => expect(err).toHaveBeenCalledWith("Error al cargar exámenes:", expect.any(Error)));
  });

  test("CP-FE-08.4 editar desde la tabla abre el formulario en modo edición y volver al listado lo cierra", async () => {
    mockGet({ "/examenes": EXAMENES, "/tipo-examen": TIPOS, "/pacientes": PACIENTES, "/examenes/1": EXAMENES[0], "/documentos/examen/1": [] });
    renderCon(<ExamenesList />, { rol: "admin" });
    await userEvent.click((await screen.findAllByRole("button", { name: "Editar examen" }))[0]);
    expect(await screen.findByText("Editar examen")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Listar Exámenes/ }));
    expect(screen.getByText("Hemograma")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Nuevo Examen/ }));
    expect(await screen.findByText("Registrar nuevo examen")).toBeInTheDocument();
  });

  test("CP-FE-08.5 el parámetro ?edit=ID abre directamente la edición y se limpia de la URL", async () => {
    mockGet({ "/examenes": EXAMENES, "/tipo-examen": TIPOS, "/pacientes": PACIENTES, "/examenes/2": EXAMENES[1], "/documentos/examen/2": [] });
    renderCon(<ExamenesList />, { rol: "medico", ruta: "/examenes?edit=2" });
    expect(await screen.findByText("Editar examen")).toBeInTheDocument();
    expect(screen.getByTestId("ubicacion")).toHaveTextContent(/^\/examenes$/);
  });

  test("CP-FE-08.6 crear un examen vuelve al listado y lo recarga", async () => {
    const get = mockGet({ "/examenes": [], "/tipo-examen": TIPOS, "/pacientes": PACIENTES });
    vi.spyOn(api, "post").mockResolvedValue({ data: { id: 50 } });
    renderCon(<ExamenesList />, { rol: "medico" });
    await userEvent.click(await screen.findByRole("tab", { name: /Nuevo Examen/ }));
    await screen.findByRole("button", { name: "Crear Examen" });
    await elegir(0, "Glicemia");
    await elegir(1, "Luis Mora - 22222222-2");
    await userEvent.click(screen.getByRole("button", { name: "Crear Examen" }));
    expect(await screen.findByRole("tab", { name: /Listar Exámenes/, selected: true })).toBeInTheDocument();
    expect(get.mock.calls.filter(([u]) => u === "/examenes")).toHaveLength(2);
  });
});

describe("CP-FE-08.B Eliminación de exámenes (ExamenesTabList)", () => {
  test("CP-FE-08.7 el administrador elimina un examen tras confirmar", async () => {
    const del = vi.spyOn(api, "delete").mockResolvedValue({});
    const onLoad = vi.fn();
    renderCon(<ExamenesTabList items={EXAMENES} onLoad={onLoad} onEdit={vi.fn()} />, { rol: "admin" });
    await userEvent.click(screen.getAllByRole("button", { name: "Eliminar examen" })[0]);
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("Hemograma");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(onLoad).toHaveBeenCalled());
    expect(del).toHaveBeenCalledWith("/examenes/1");
    expect(toast.success).toHaveBeenCalledWith("Examen eliminado exitosamente");
  });

  test("CP-FE-08.8 un error al eliminar muestra el mensaje y mantiene el diálogo", async () => {
    vi.spyOn(api, "delete").mockRejectedValue(new Error("403"));
    renderCon(<ExamenesTabList items={EXAMENES} onLoad={vi.fn()} />, { rol: "admin" });
    await userEvent.click(screen.getAllByRole("button", { name: "Eliminar examen" })[1]);
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Error al eliminar el examen: 403"));
  });

  test("CP-FE-08.9 cancelar no elimina; sin onEdit el botón editar navega al detalle", async () => {
    const del = vi.spyOn(api, "delete");
    renderCon(<ExamenesTabList items={EXAMENES} onLoad={vi.fn()} />, { rol: "admin" });
    await userEvent.click(screen.getAllByRole("button", { name: "Eliminar examen" })[0]);
    const dialogo = await screen.findByRole("dialog");
    const eliminar = within(dialogo).getByRole("button", { name: "Eliminar" });
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(eliminar);
    expect(del).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getAllByRole("button", { name: "Editar examen" })[1]);
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/examenes/2");
  });
});

describe("CP-FE-08.C Formulario de examen (ExamenForm)", () => {
  test("CP-FE-08.10 sin selección de tipo y paciente muestra errores y no envía", async () => {
    mockGet({ "/tipo-examen": TIPOS, "/pacientes": PACIENTES });
    const post = vi.spyOn(api, "post");
    const { container } = renderCon(<ExamenForm onSuccess={vi.fn()} />, { rol: "medico" });
    await screen.findByRole("button", { name: "Crear Examen" });
    fireEvent.submit(container.querySelector("form"));
    await waitFor(() => expect(screen.getAllByRole("combobox")[0]).toHaveAttribute("aria-invalid", "true"));
    expect(post).not.toHaveBeenCalled();
  });

  test("CP-FE-08.11 adjuntar un documento antes de elegir paciente muestra un error", async () => {
    mockGet({ "/tipo-examen": TIPOS, "/pacientes": PACIENTES });
    const { container } = renderCon(<ExamenForm onSuccess={vi.fn()} />, { rol: "medico" });
    await screen.findByText("Arrastra un archivo aquí");
    await userEvent.upload(inputArchivo(container), pdf());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Debe seleccionar un paciente primero"));
  });

  test("CP-FE-08.12 crea el examen y sube el documento pendiente", async () => {
    mockGet({ "/tipo-examen": TIPOS, "/pacientes": PACIENTES });
    let resolverExamen;
    const post = vi
      .spyOn(api, "post")
      .mockImplementationOnce(() => new Promise((r) => (resolverExamen = r)))
      .mockResolvedValueOnce({ data: { documento: { id: 7 } } });
    const onSuccess = vi.fn();
    const { container } = renderCon(<ExamenForm onSuccess={onSuccess} />, { rol: "medico" });
    await screen.findByRole("button", { name: "Crear Examen" });
    await elegir(0, "Hemograma");
    await elegir(1, "Ana Pérez Soto - 11111111-1");
    fireEvent.change(container.querySelector('[name="diagnosis"]'), { target: { value: "Anemia leve" } });

    await userEvent.upload(inputArchivo(container), pdf("informe.pdf"));
    expect(await screen.findByText("informe.pdf")).toBeInTheDocument();
    expect(screen.getByText("0.00 MB")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Archivo listo para subir");

    await userEvent.click(screen.getByRole("button", { name: "Crear Examen" }));
    expect(await screen.findByRole("button", { name: "Creando..." })).toBeDisabled();
    await act(async () => resolverExamen({ data: { id: 30 } }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(post).toHaveBeenNthCalledWith(1, "/examenes", expect.objectContaining({ tipo_examen_medico_id: 1, paciente_id: 11, diagnosis: "Anemia leve" }));
    const [url, form] = post.mock.calls[1];
    expect(url).toBe("/documentos");
    expect(form.get("examen_medico_id")).toBe("30");
    expect(form.get("paciente_id")).toBe("11");
    expect(toast.success).toHaveBeenCalledWith("Documento subido exitosamente");
  });

  test("CP-FE-08.13 el documento pendiente se puede quitar antes de crear", async () => {
    mockGet({ "/tipo-examen": TIPOS, "/pacientes": PACIENTES });
    const { container } = renderCon(<ExamenForm onSuccess={vi.fn()} />, { rol: "admin" });
    await screen.findByRole("button", { name: "Crear Examen" });
    await elegir(1, "Luis Mora - 22222222-2");
    await userEvent.upload(inputArchivo(container), pdf("quitar.pdf"));
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar quitar.pdf" }));
    expect(screen.queryByText("quitar.pdf")).toBeNull();
  });

  test("CP-FE-08.14 si falla la subida del documento pendiente se informa el error", async () => {
    mockGet({ "/tipo-examen": TIPOS, "/pacientes": PACIENTES });
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: { id: 31 } }).mockRejectedValueOnce(new Error("413"));
    const { container } = renderCon(<ExamenForm onSuccess={vi.fn()} />, { rol: "medico" });
    await screen.findByRole("button", { name: "Crear Examen" });
    await elegir(0, "Glicemia");
    await elegir(1, "Luis Mora - 22222222-2");
    await userEvent.upload(inputArchivo(container), pdf());
    await userEvent.click(screen.getByRole("button", { name: "Crear Examen" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Error al subir documento"));
  });

  test("CP-FE-08.15 crear sin documento y respuesta sin id no intenta subir archivos", async () => {
    mockGet({ "/tipo-examen": null, "/pacientes": null });
    renderCon(<ExamenForm onSuccess={vi.fn()} />, { rol: "medico" });
    expect(await screen.findByRole("button", { name: "Crear Examen" })).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });

  test("CP-FE-08.16 un error de la API al crear mantiene el formulario", async () => {
    mockGet({ "/tipo-examen": TIPOS, "/pacientes": PACIENTES });
    vi.spyOn(api, "post").mockRejectedValue(new Error("500"));
    const onSuccess = vi.fn();
    renderCon(<ExamenForm onSuccess={onSuccess} />, { rol: "medico" });
    await screen.findByRole("button", { name: "Crear Examen" });
    await elegir(0, "Glicemia");
    await elegir(1, "Luis Mora - 22222222-2");
    await userEvent.click(screen.getByRole("button", { name: "Crear Examen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear Examen" })).toBeEnabled());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test("CP-FE-08.17 error al cargar catálogos se registra en consola", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGet({ "/tipo-examen": new Error("500"), "/pacientes": PACIENTES });
    renderCon(<ExamenForm onSuccess={vi.fn()} />, { rol: "medico" });
    await waitFor(() => expect(err).toHaveBeenCalledWith("Error al cargar datos:", expect.any(Error)));
  });

  test("CP-FE-08.18 el paciente (sin rol clínico) no ve la sección de documentos", async () => {
    mockGet({ "/tipo-examen": TIPOS, "/pacientes": PACIENTES });
    renderCon(<ExamenForm onSuccess={vi.fn()} />, { rol: "paciente" });
    await screen.findByRole("button", { name: "Crear Examen" });
    expect(screen.queryByText("Documentos del Examen")).toBeNull();
  });

  describe("modo edición", () => {
    const DOCS = [
      { id: 70, nombre_archivo: "hemo.pdf", created_at: "2026-02-01T10:00:00Z" },
      { id: 71, created_at: "2026-02-02T10:00:00Z" },
    ];
    const base = (extra = {}) => ({
      "/tipo-examen": TIPOS,
      "/pacientes": PACIENTES,
      "/examenes/1": { tipo_examen_medico_id: 1, paciente_id: 11, diagnosis: "Dx", tratamiento: "Tx", observaciones: "Obs", notas: "N" },
      "/documentos/examen/1": DOCS,
      ...extra,
    });

    test("CP-FE-08.19 carga el examen y sus documentos y permite actualizarlo", async () => {
      mockGet(base());
      let resolver;
      const put = vi.spyOn(api, "put").mockReturnValue(new Promise((r) => (resolver = r)));
      const onSuccess = vi.fn();
      const { container } = renderCon(<ExamenForm onSuccess={onSuccess} examenId={1} />, { rol: "medico" });
      expect(await screen.findByText("Documentos subidos (2)")).toBeInTheDocument();
      expect(screen.getByText("Archivo 71")).toBeInTheDocument();
      expect(container.querySelector('[name="tratamiento"]')).toHaveValue("Tx");
      await userEvent.click(screen.getByRole("button", { name: "Actualizar Examen" }));
      expect(await screen.findByRole("button", { name: "Actualizando..." })).toBeDisabled();
      await act(async () => resolver({}));
      expect(put).toHaveBeenCalledWith("/examenes/1", expect.objectContaining({ diagnosis: "Dx" }));
      expect(toast.success).toHaveBeenCalledWith("Examen actualizado exitosamente");
      expect(onSuccess).toHaveBeenCalled();
    });

    test("CP-FE-08.20 sube un documento directamente mostrando el estado 'Subiendo...'", async () => {
      const get = mockGet(base());
      let resolver;
      const post = vi.spyOn(api, "post").mockReturnValue(new Promise((r) => (resolver = r)));
      const { container } = renderCon(<ExamenForm onSuccess={vi.fn()} examenId={1} />, { rol: "medico" });
      await screen.findByText("Documentos subidos (2)");
      await userEvent.upload(inputArchivo(container), pdf("nuevo.pdf"));
      expect(await screen.findByText("Subiendo documento...")).toBeInTheDocument();
      await act(async () => resolver({}));
      expect(post.mock.calls[0][1].get("examen_medico_id")).toBe("1");
      await waitFor(() => expect(get.mock.calls.filter(([u]) => u === "/documentos/examen/1")).toHaveLength(2));
    });

    test("CP-FE-08.21 informa el error si la subida directa falla", async () => {
      mockGet(base());
      vi.spyOn(api, "post").mockRejectedValue(new Error("500"));
      const { container } = renderCon(<ExamenForm onSuccess={vi.fn()} examenId={1} />, { rol: "medico" });
      await screen.findByText("Documentos subidos (2)");
      await userEvent.upload(inputArchivo(container), pdf());
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Error al subir documento"));
    });

    test("CP-FE-08.22 un examen sin paciente no permite subir documentos", async () => {
      mockGet(base({ "/examenes/1": { tipo_examen_medico_id: 1, paciente_id: null }, "/documentos/examen/1": null }));
      const { container } = renderCon(<ExamenForm onSuccess={vi.fn()} examenId={1} />, { rol: "medico" });
      await screen.findByText("Sube el documento de resultado del examen médico");
      await userEvent.upload(inputArchivo(container), pdf());
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Debe seleccionar un paciente primero"));
    });

    test("CP-FE-08.23 descarga un documento como archivo", async () => {
      mockGet((url) => (url === "/documentos/70" ? "binario" : base()[url]));
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      renderCon(<ExamenForm onSuccess={vi.fn()} examenId={1} />, { rol: "medico" });
      await userEvent.click((await screen.findAllByRole("button", { name: "Ver Documento" }))[0]);
      await waitFor(() => expect(click).toHaveBeenCalled());
      expect(api.get).toHaveBeenCalledWith("/documentos/70", { responseType: "blob" });
    });

    test("CP-FE-08.24 error de descarga muestra un mensaje", async () => {
      mockGet((url) => (url === "/documentos/70" ? new Error("404") : base()[url]));
      renderCon(<ExamenForm onSuccess={vi.fn()} examenId={1} />, { rol: "medico" });
      await userEvent.click((await screen.findAllByRole("button", { name: "Ver Documento" }))[0]);
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Error al descargar documento"));
    });

    test("CP-FE-08.25 eliminar documento pide confirmación y recarga la lista", async () => {
      mockGet(base());
      const del = vi.spyOn(api, "delete").mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("403"));
      const confirmar = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
      renderCon(<ExamenForm onSuccess={vi.fn()} examenId={1} />, { rol: "admin" });
      const boton = await screen.findByRole("button", { name: "Eliminar hemo.pdf" });
      await userEvent.click(boton);
      expect(del).not.toHaveBeenCalled();
      await userEvent.click(boton);
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Documento eliminado"));
      await userEvent.click(boton);
      await waitFor(() => expect(del).toHaveBeenCalledTimes(2));
      expect(confirmar).toHaveBeenCalledWith('¿Estás seguro de eliminar el documento "hemo.pdf"?');
    });

    test("CP-FE-08.26 errores al cargar examen o documentos se registran en consola", async () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      mockGet(base({ "/examenes/1": new Error("404") }));
      renderCon(<ExamenForm onSuccess={vi.fn()} examenId={1} />, { rol: "medico" });
      await waitFor(() => expect(err).toHaveBeenCalledWith("Error al cargar examen:", expect.any(Error)));
      mockGet(base({ "/documentos/examen/1": new Error("500") }));
      renderCon(<ExamenForm onSuccess={vi.fn()} examenId={1} />, { rol: "medico" });
      await waitFor(() => expect(err).toHaveBeenCalledWith("Error al cargar documentos:", expect.any(Error)));
    });

    test("CP-FE-08.27 arrastrar un archivo resalta la zona y un tipo no permitido se ignora", async () => {
      mockGet(base());
      const post = vi.spyOn(api, "post");
      renderCon(<ExamenForm onSuccess={vi.fn()} examenId={1} />, { rol: "medico" });
      const zona = (await screen.findByText("Arrastra un archivo aquí")).closest("div");
      const exe = new File(["MZ"], "virus.exe", { type: "application/x-msdownload" });
      const dataTransfer = { files: [exe], items: [{ kind: "file", type: exe.type, getAsFile: () => exe }], types: ["Files"] };
      fireEvent.dragEnter(zona, { dataTransfer });
      expect(await screen.findByText("Suelta el archivo aquí")).toBeInTheDocument();
      fireEvent.drop(zona, { dataTransfer });
      await waitFor(() => expect(screen.getByText("Arrastra un archivo aquí")).toBeInTheDocument());
      expect(post).not.toHaveBeenCalled();
    });
  });
});

describe("CP-FE-08.D Detalle de examen", () => {
  const COMPLETO = { id: 1, paciente_id: 11, tipo_examen_nombre: "Hemograma", paciente_primer_nombre: "Ana", paciente_apellido_paterno: "Pérez", paciente_apellido_materno: "Soto", paciente_rut: "11111111-1", diagnosis: "Dx", tratamiento: "Tx", observaciones: "Obs", notas: "N", created_at: "2026-02-01T10:00:00Z" };
  const montar = (rol, mapa) => {
    mockGet(mapa);
    return renderCon(<ExamenDetalle />, { rol, ruta: "/examenes/1", path: "/examenes/:id" });
  };

  test("CP-FE-08.28 muestra todos los datos clínicos y los documentos", async () => {
    montar("paciente", { "/examenes/1": COMPLETO, "/documentos/examen/1": [{ id: 9, nombre_archivo: "hemo.pdf" }] });
    expect(screen.getByText("Cargando examen...")).toBeInTheDocument();
    expect(await screen.findByText("Ana Pérez Soto")).toBeInTheDocument();
    for (const t of ["Diagnóstico", "Tratamiento", "Observaciones", "Notas"]) expect(screen.getByText(t)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "hemo.pdf" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Subir Documento" })).toBeNull();
  });

  test("CP-FE-08.29 examen sin campos opcionales ni documentos", async () => {
    montar("medico", {
      "/examenes/1": { id: 1, tipo_examen_nombre: "Glicemia", paciente_primer_nombre: "Luis", paciente_apellido_paterno: "Mora", created_at: "2026-02-01" },
      "/documentos/examen/1": new Error("403"),
    });
    expect(await screen.findByText("No hay documentos asociados")).toBeInTheDocument();
    expect(screen.getByText("Luis Mora")).toBeInTheDocument();
    expect(screen.queryByText("Diagnóstico")).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
  });

  test("CP-FE-08.30 documentos nulos se tratan como lista vacía y Volver regresa al listado", async () => {
    montar("medico", { "/examenes/1": COMPLETO, "/documentos/examen/1": null });
    await userEvent.click(await screen.findByRole("button", { name: "Volver" }));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/examenes");
  });

  test("CP-FE-08.31 si el examen no existe muestra error y vuelve al listado", async () => {
    montar("medico", { "/examenes/1": new Error("404") });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Error al cargar examen"));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/examenes");
  });

  test("CP-FE-08.32 una respuesta vacía no renderiza contenido", async () => {
    const { container } = montar("medico", { "/examenes/1": null, "/documentos/examen/1": [] });
    await waitFor(() => expect(screen.queryByText("Cargando examen...")).toBeNull());
    expect(container.querySelector("h5")).toBeNull();
  });

  test("CP-FE-08.33 Editar navega al listado con el parámetro de edición", async () => {
    montar("medico", { "/examenes/1": COMPLETO, "/documentos/examen/1": [] });
    await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/examenes?edit=1");
  });

  test("CP-FE-08.34 el admin elimina el examen tras confirmar (y puede cancelar)", async () => {
    vi.spyOn(api, "delete").mockRejectedValueOnce(new Error("500")).mockResolvedValueOnce({});
    montar("admin", { "/examenes/1": COMPLETO, "/documentos/examen/1": [] });
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    const dialogo = await screen.findByRole("dialog");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    expect(screen.getByTestId("ubicacion")).toHaveTextContent("/examenes/1");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(screen.getByTestId("ubicacion")).toHaveTextContent(/^\/examenes$/));
    expect(toast.success).toHaveBeenCalledWith("Examen eliminado exitosamente");
  });

  test("CP-FE-08.35 el admin elimina documentos con confirmación", async () => {
    vi.spyOn(api, "delete").mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("500"));
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    montar("admin", { "/examenes/1": COMPLETO, "/documentos/examen/1": [{ id: 9, nombre_archivo: "hemo.pdf" }] });
    const boton = await screen.findByRole("button", { name: "Eliminar hemo.pdf" });
    await userEvent.click(boton);
    expect(api.delete).not.toHaveBeenCalled();
    await userEvent.click(boton);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Documento eliminado"));
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar hemo.pdf" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(2));
  });

  test("CP-FE-08.36 descarga de documento exitosa y con error", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    let falla = false;
    mockGet((url) => {
      if (url === "/documentos/9") return falla ? new Error("404") : "bin";
      return { "/examenes/1": COMPLETO, "/documentos/examen/1": [{ id: 9, nombre_archivo: "hemo.pdf" }] }[url];
    });
    renderCon(<ExamenDetalle />, { rol: "paciente", ruta: "/examenes/1", path: "/examenes/:id" });
    await userEvent.click(await screen.findByRole("button", { name: "hemo.pdf" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    falla = true;
    await userEvent.click(screen.getByRole("button", { name: "hemo.pdf" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Error al descargar documento"));
  });

  test("CP-FE-08.37 el médico sube un documento desde el diálogo", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("500"));
    montar("medico", { "/examenes/1": COMPLETO, "/documentos/examen/1": [] });
    await userEvent.click(await screen.findByRole("button", { name: "Subir Documento" }));
    const dialogo = await screen.findByRole("dialog");
    const input = dialogo.querySelector('input[type="file"]');
    await userEvent.upload(input, pdf());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Documento subido exitosamente"));
    expect(post.mock.calls[0][1].get("paciente_id")).toBe("11");

    await userEvent.click(await screen.findByRole("button", { name: "Subir Documento" }));
    const dialogo2 = await screen.findByRole("dialog");
    await userEvent.upload(dialogo2.querySelector('input[type="file"]'), pdf());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Error al subir documento"));
    await userEvent.click(within(dialogo2).getByRole("button", { name: "Cancelar" }));
  });

  test("CP-FE-08.38 arrastrar un archivo no permitido sobre el diálogo no lo sube", async () => {
    const post = vi.spyOn(api, "post");
    montar("medico", { "/examenes/1": COMPLETO, "/documentos/examen/1": [] });
    await userEvent.click(await screen.findByRole("button", { name: "Subir Documento" }));
    const zona = (await screen.findByText("Arrastra un archivo aquí")).closest("div");
    const exe = new File(["MZ"], "virus.exe", { type: "application/x-msdownload" });
    const dataTransfer = { files: [exe], items: [{ kind: "file", type: exe.type, getAsFile: () => exe }], types: ["Files"] };
    fireEvent.dragEnter(zona, { dataTransfer });
    expect(await screen.findByText("Suelta el archivo aquí")).toBeInTheDocument();
    fireEvent.drop(zona, { dataTransfer });
    await waitFor(() => expect(screen.getByText("Arrastra un archivo aquí")).toBeInTheDocument());
    expect(post).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  });
});

describe("CP-FE-08.E Mis resultados (paciente)", () => {
  test("CP-FE-08.39 lista los exámenes del paciente con su detalle y documentos descargables", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mockGet({
      "/examenes/paciente/11": [
        { id: 1, tipo_examen_nombre: "Hemograma", created_at: "2026-02-01", diagnosis: "Dx", tratamiento: "Tx", observaciones: "Obs", notas: "N" },
        { id: 2, tipo_examen_nombre: "Glicemia", created_at: "2026-02-02" },
        { id: 3, tipo_examen_nombre: "Orina", created_at: "2026-02-03" },
      ],
      "/documentos/examen/1": [{ id: 9, nombre_archivo: "hemo.pdf" }],
      "/documentos/examen/2": new Error("403"),
      "/documentos/examen/3": null,
      "/documentos/9": "bin",
    });
    renderCon(<MisResultados />, { rol: "paciente" });
    expect(screen.getByText("Cargando tus resultados...")).toBeInTheDocument();
    await userEvent.click(await screen.findByText("Hemograma"));
    expect(screen.getByText("Diagnóstico:")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "hemo.pdf" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
  });

  test("CP-FE-08.40 error de descarga muestra un mensaje", async () => {
    mockGet({ "/examenes/paciente/11": [{ id: 1, tipo_examen_nombre: "H", created_at: "2026-02-01" }], "/documentos/examen/1": [{ id: 9, nombre_archivo: "h.pdf" }], "/documentos/9": new Error("404") });
    renderCon(<MisResultados />, { rol: "paciente" });
    await userEvent.click(await screen.findByText("H"));
    await userEvent.click(await screen.findByRole("button", { name: "h.pdf" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Error al descargar documento"));
  });

  test("CP-FE-08.41 sin exámenes (o sin ficha de paciente) muestra el mensaje vacío", async () => {
    mockGet({ "/examenes/paciente/11": null });
    renderCon(<MisResultados />, { rol: "paciente" });
    expect(await screen.findByText("No tienes exámenes médicos registrados")).toBeInTheDocument();
    const get = mockGet({});
    renderCon(<MisResultados />, { rol: "paciente", user: { nombre_usuario: "x" } });
    expect((await screen.findAllByText("No tienes exámenes médicos registrados")).length).toBe(2);
    expect(get).not.toHaveBeenCalled();
  });

  test("CP-FE-08.42 error al cargar resultados informa al usuario", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGet({ "/examenes/paciente/11": new Error("500") });
    renderCon(<MisResultados />, { rol: "paciente" });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Error al cargar tus resultados"));
  });
});
