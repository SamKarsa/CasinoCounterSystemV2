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
            commands::routes::get_all_routes,
            commands::routes::create_route,
            commands::routes::update_route,
            commands::routes::delete_route,
            commands::machines::get_all_type_machines,
            commands::machines::get_all_coin_types,
            commands::machines::get_machines_by_route,
            commands::machines::create_machine,
            commands::machines::update_machine,
            commands::machines::delete_machine,
            commands::records::get_records_by_machine,
            commands::records::create_counter_record,
            commands::records::update_counter_record,
            commands::records::delete_counter_record,
            commands::records::get_route_summary,
            commands::users::change_own_password,
            commands::users::get_operator,
            commands::users::update_operator,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
