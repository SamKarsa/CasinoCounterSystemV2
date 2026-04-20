use tauri::State;
use rusqlite::Connection;
use std::sync::Mutex;

pub mod auth;

// Estado global para compartir la conexión a la BD
pub struct DbConnection(pub Mutex<Connection>);