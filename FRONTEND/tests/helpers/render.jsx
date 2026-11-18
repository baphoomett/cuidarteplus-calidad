import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthContext } from "../../src/context/authContextInstance";

/** Muestra la ruta actual para verificar navegaciones */
export function Ubicacion() {
  const location = useLocation();
  return <div data-testid="ubicacion">{location.pathname + location.search}</div>;
}

export const USUARIOS = {
  admin: { usuarioId: 1, nombre_usuario: "admin", rolNombre: "admin" },
  medico: { usuarioId: 2, nombre_usuario: "medico", rolNombre: "medico" },
  paciente: { usuarioId: 7, nombre_usuario: "paciente", rolNombre: "paciente", pacienteId: 11 },
};

/**
 * Renderiza un componente dentro del router y de un AuthContext simulado.
 * @param ui elemento a renderizar
 * @param opciones.rol "admin" | "medico" | "paciente" | null
 * @param opciones.ruta ruta inicial
 * @param opciones.path patrón de ruta donde se monta el componente
 */
export function renderCon(ui, { rol = "admin", user, auth = {}, ruta = "/", path = "*" } = {}) {
  const valor = {
    token: rol ? "token" : null,
    user: user !== undefined ? user : rol ? USUARIOS[rol] : null,
    role: rol,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    ...auth,
  };
  const utils = render(
    <AuthContext.Provider value={valor}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
        <Ubicacion />
      </MemoryRouter>
    </AuthContext.Provider>
  );
  return { ...utils, auth: valor };
}
