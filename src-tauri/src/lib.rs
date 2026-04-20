mod database;
mod commands;

use commands::DbConnection;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let db_path = if cfg!(debug_assertions) {
                std::env::current_dir()?.join("casino_counter.db")
            } else {
                let dir = app.path().app_data_dir()?;
                std::fs::create_dir_all(&dir)?;
                dir.join("casino_counter.db")
            };

            let conn = database::init_database(db_path)?;
            app.manage(DbConnection(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::authenticate_user,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
