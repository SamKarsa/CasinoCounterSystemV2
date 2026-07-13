import { useEffect, useState } from "react";
import { changeOwnPassword, getOperator, updateOperator } from "../lib/tauri";
import type { User } from "../types";

interface UserManagementProps {
  user: User;
}

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-navy-500";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";
const buttonClass =
  "bg-navy-900 text-white px-4 py-2 rounded-md font-semibold text-sm hover:bg-navy-800 transition-colors disabled:bg-gray-400";

// Los mensajes de éxito se borran solos; los de error se quedan hasta el
// siguiente intento.
const SUCCESS_TIMEOUT_MS = 4000;

export default function UserManagement({ user }: UserManagementProps) {
  // Mi cuenta
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountError, setAccountError] = useState("");
  const [accountOk, setAccountOk] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);

  // Operador
  const [operatorName, setOperatorName] = useState("");
  const [operatorPassword, setOperatorPassword] = useState("");
  const [operatorConfirm, setOperatorConfirm] = useState("");
  const [operatorError, setOperatorError] = useState("");
  const [operatorOk, setOperatorOk] = useState("");
  const [loadingOperator, setLoadingOperator] = useState(true);
  const [savingOperator, setSavingOperator] = useState(false);

  useEffect(() => {
    getOperator()
      .then((operator) => setOperatorName(operator.userName))
      .catch((err) =>
        setOperatorError(
          typeof err === "string" ? err : "Error cargando el operador"
        )
      )
      .finally(() => setLoadingOperator(false));
  }, []);

  // El temporizador se reinicia solo: al reenviar, el submit pone el mensaje en
  // "" y el efecto vuelve a correr limpiando el timeout anterior.
  useEffect(() => {
    if (!accountOk) return;
    const timer = setTimeout(() => setAccountOk(""), SUCCESS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [accountOk]);

  useEffect(() => {
    if (!operatorOk) return;
    const timer = setTimeout(() => setOperatorOk(""), SUCCESS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [operatorOk]);

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountError("");
    setAccountOk("");

    if (newPassword !== confirmPassword) {
      setAccountError("Las contraseñas no coinciden");
      return;
    }

    setSavingAccount(true);
    try {
      await changeOwnPassword(user.userId, currentPassword, newPassword);
      setAccountOk("Contraseña actualizada");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setAccountError(
        typeof err === "string" ? err : "Error actualizando la contraseña"
      );
    } finally {
      setSavingAccount(false);
    }
  };

  const handleOperatorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOperatorError("");
    setOperatorOk("");

    if (operatorPassword !== operatorConfirm) {
      setOperatorError("Las contraseñas no coinciden");
      return;
    }

    setSavingOperator(true);
    try {
      const updated = await updateOperator(
        operatorName,
        operatorPassword === "" ? null : operatorPassword
      );
      // El backend devuelve el nombre ya normalizado (sin espacios sobrantes)
      setOperatorName(updated.userName);
      setOperatorOk(
        operatorPassword === ""
          ? "Operador actualizado"
          : "Operador actualizado y contraseña cambiada"
      );
      setOperatorPassword("");
      setOperatorConfirm("");
    } catch (err) {
      setOperatorError(
        typeof err === "string" ? err : "Error actualizando el operador"
      );
    } finally {
      setSavingOperator(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-navy-900 mb-8">Usuarios</h2>

      {/* Mi cuenta */}
      <section>
        <h3 className="text-lg font-semibold text-navy-900">
          Mi cuenta
          <span className="ml-2 text-sm font-normal text-gray-400">
            {user.userName}
          </span>
        </h3>
        <p className="text-gray-500 text-sm mt-1 mb-5">
          Cambiá tu contraseña de acceso.
        </p>

        <form onSubmit={handleAccountSubmit} className="space-y-4">
          <div className="max-w-xs">
            <label className={labelClass}>Contraseña actual</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nueva contraseña</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Confirmar nueva contraseña</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={savingAccount} className={buttonClass}>
              {savingAccount ? "Guardando..." : "Cambiar contraseña"}
            </button>
            {accountError && (
              <span className="text-sm text-red-600">{accountError}</span>
            )}
            {accountOk && (
              <span className="text-sm text-green-600">{accountOk}</span>
            )}
          </div>
        </form>
      </section>

      <div className="border-t border-gray-200 my-10" />

      {/* Operador */}
      <section>
        <h3 className="text-lg font-semibold text-navy-900">Operador</h3>
        <p className="text-gray-500 text-sm mt-1 mb-5">
          Cuenta de digitación · Dejá las contraseñas vacías para no cambiarla.
        </p>

        {loadingOperator ? (
          <p className="text-gray-400 text-sm">Cargando operador...</p>
        ) : (
          <form onSubmit={handleOperatorSubmit} className="space-y-4">
            <div className="max-w-xs">
              <label className={labelClass}>Nombre de usuario</label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                required
                maxLength={50}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nueva contraseña</label>
                <input
                  type="password"
                  value={operatorPassword}
                  onChange={(e) => setOperatorPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Confirmar nueva contraseña</label>
                <input
                  type="password"
                  value={operatorConfirm}
                  onChange={(e) => setOperatorConfirm(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingOperator}
                className={buttonClass}
              >
                {savingOperator ? "Guardando..." : "Guardar"}
              </button>
              {operatorError && (
                <span className="text-sm text-red-600">{operatorError}</span>
              )}
              {operatorOk && (
                <span className="text-sm text-green-600">{operatorOk}</span>
              )}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
