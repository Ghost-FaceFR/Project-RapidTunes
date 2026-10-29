use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
  #[error("Erreur de validation: {0}")]
  Validation(String),

  #[error("Erreur d'E/S: {0}")]
  Io(#[from] std::io::Error),

  #[error("Erreur de parsing JSON: {0}")]
  Json(#[from] serde_json::Error),

  #[error("Erreur UTF-8: {0}")]
  Utf8(#[from] std::string::FromUtf8Error),

  #[error("Exécution externe échouée: {0}")]
  CommandFailed(String)
}
