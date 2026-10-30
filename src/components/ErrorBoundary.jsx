import { Component } from "react";

/**
 * Empêche l'écran noir si l'interface plante au démarrage (par exemple à cause de données locales
 * corrompues): affiche l'erreur et propose de réinitialiser les données de l'application.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Erreur d'interface:", error, info?.componentStack);
  }

  handleReset = () => {
    try {
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith("rapidtunes"))
        .forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // stockage indisponible
    }
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="boot-error" role="alert">
        <h1>RapidTunes a rencontré un problème</h1>
        <p>L'interface n'a pas pu s'afficher. Réinitialiser les données de l'application corrige généralement ce problème.</p>
        <pre>{String(error?.message ?? error)}</pre>
        <div className="boot-error__actions">
          <button type="button" onClick={() => window.location.reload()}>Recharger</button>
          <button type="button" onClick={this.handleReset}>Réinitialiser les données et recharger</button>
        </div>
      </div>
    );
  }
}
