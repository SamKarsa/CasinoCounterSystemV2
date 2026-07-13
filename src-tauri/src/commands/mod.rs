use tauri::State;
use rusqlite::Connection;
use std::sync::Mutex;

pub mod auth;
pub mod machines;
pub mod records;
pub mod routes;
pub mod users;

// Estado global para compartir la conexión a la BD
pub struct DbConnection(pub Mutex<Connection>);