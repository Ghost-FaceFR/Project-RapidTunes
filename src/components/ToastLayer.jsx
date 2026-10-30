import PlayerIcon from "./PlayerIcon";

const KIND_LABELS = {
  error: "Erreur",
  success: "Succès",
  info: "Information"
};

/**
 * Notifications en surimpression. Chaque notification se ferme seule: la barre de progression
 * se vide pendant la durée d'affichage restante et sa fin ferme la notification.
 * Le survol met la barre (donc le compte à rebours) en pause. duration = 0: reste jusqu'à fermeture.
 */
export default function ToastLayer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-layer" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.key ?? toast.id}
          className={`toast toast--${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
        >
          <div className="toast__body">
            <strong className="toast__title">{toast.title ?? KIND_LABELS[toast.kind] ?? KIND_LABELS.info}</strong>
            <p className="toast__message">{toast.message}</p>
          </div>
          <button type="button" className="toast__close" onClick={() => onDismiss(toast.id)} aria-label="Fermer">
            <PlayerIcon name="close" />
          </button>
          {toast.duration > 0 ? (
            <span
              className="toast__progress"
              style={{ animationDuration: `${toast.duration}ms` }}
              onAnimationEnd={() => onDismiss(toast.id)}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
