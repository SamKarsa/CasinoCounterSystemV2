use super::*;
use crate::database::models::Route;
use rusqlite::{params, OptionalExtension};

const MAX_ROUTE_NAME_LEN: usize = 100;

#[tauri::command]
pub fn get_all_routes(db: State<DbConnection>) -> Result<Vec<Route>, String> {
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT routeId, routeName FROM Route ORDER BY routeName")
        .map_err(|e| {
            eprintln!("routes: failed to prepare statement: {}", e);
            "No se pudieron cargar las rutas".to_string()
        })?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Route {
                route_id: row.get(0)?,
                route_name: row.get(1)?,
            })
        })
        .map_err(|e| {
            eprintln!("routes: query failed: {}", e);
            "No se pudieron cargar las rutas".to_string()
        })?;

    let mut routes = Vec::new();
    for route in rows {
        routes.push(route.map_err(|e| {
            eprintln!("routes: failed to read row: {}", e);
            "No se pudieron cargar las rutas".to_string()
        })?);
    }

    Ok(routes)
}

#[tauri::command]
pub fn create_route(route_name: String, db: State<DbConnection>) -> Result<Route, String> {
    let name = route_name.trim();

    if name.is_empty() {
        return Err("El nombre de la ruta no puede estar vacío".to_string());
    }
    if name.chars().count() > MAX_ROUTE_NAME_LEN {
        return Err(format!(
            "El nombre de la ruta no puede superar {} caracteres",
            MAX_ROUTE_NAME_LEN
        ));
    }

    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    // Unicidad sin distinguir mayúsculas/minúsculas: "Ruta A" y "ruta A" chocan.
    // COLLATE NOCASE aplica en la consulta (no depende del esquema, funciona
    // también sobre una BD migrada desde la app C#).
    let exists = conn
        .query_row(
            "SELECT 1 FROM Route WHERE routeName = ?1 COLLATE NOCASE LIMIT 1",
            [name],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| {
            eprintln!("routes: duplicate check failed: {}", e);
            "No se pudo crear la ruta".to_string()
        })?;
    if exists.is_some() {
        return Err("Ya existe una ruta con ese nombre".to_string());
    }

    conn.execute("INSERT INTO Route (routeName) VALUES (?1)", [name])
        .map_err(|e| {
            // Nombre duplicado: la columna routeName es UNIQUE
            if let rusqlite::Error::SqliteFailure(err, _) = &e {
                if err.code == rusqlite::ErrorCode::ConstraintViolation {
                    return "Ya existe una ruta con ese nombre".to_string();
                }
            }
            eprintln!("routes: insert failed: {}", e);
            "No se pudo crear la ruta".to_string()
        })?;

    let route_id = conn.last_insert_rowid();

    Ok(Route {
        route_id,
        route_name: name.to_string(),
    })
}

#[tauri::command]
pub fn update_route(
    route_id: i64,
    route_name: String,
    db: State<DbConnection>,
) -> Result<Route, String> {
    let name = route_name.trim();

    if name.is_empty() {
        return Err("El nombre de la ruta no puede estar vacío".to_string());
    }
    if name.chars().count() > MAX_ROUTE_NAME_LEN {
        return Err(format!(
            "El nombre de la ruta no puede superar {} caracteres",
            MAX_ROUTE_NAME_LEN
        ));
    }

    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    // Unicidad (case-insensitive) excluyendo la propia ruta: puede conservar su nombre
    let exists = conn
        .query_row(
            "SELECT 1 FROM Route WHERE routeName = ?1 COLLATE NOCASE AND routeId != ?2 LIMIT 1",
            params![name, route_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| {
            eprintln!("routes: duplicate check failed: {}", e);
            "No se pudo actualizar la ruta".to_string()
        })?;
    if exists.is_some() {
        return Err("Ya existe una ruta con ese nombre".to_string());
    }

    let affected = conn
        .execute(
            "UPDATE Route SET routeName = ?1 WHERE routeId = ?2",
            params![name, route_id],
        )
        .map_err(|e| {
            if let rusqlite::Error::SqliteFailure(err, _) = &e {
                if err.code == rusqlite::ErrorCode::ConstraintViolation {
                    return "Ya existe una ruta con ese nombre".to_string();
                }
            }
            eprintln!("routes: update failed: {}", e);
            "No se pudo actualizar la ruta".to_string()
        })?;

    if affected == 0 {
        return Err("La ruta no existe".to_string());
    }

    Ok(Route {
        route_id,
        route_name: name.to_string(),
    })
}

#[tauri::command]
pub fn delete_route(route_id: i64, db: State<DbConnection>) -> Result<(), String> {
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    let machine_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM Machine WHERE routeId = ?1",
            [route_id],
            |row| row.get(0),
        )
        .map_err(|e| {
            eprintln!("routes: machine count failed: {}", e);
            "No se pudo eliminar la ruta".to_string()
        })?;

    if machine_count > 0 {
        return Err("No se puede eliminar: la ruta tiene máquinas".to_string());
    }

    let affected = conn
        .execute("DELETE FROM Route WHERE routeId = ?1", [route_id])
        .map_err(|e| {
            eprintln!("routes: delete failed: {}", e);
            "No se pudo eliminar la ruta".to_string()
        })?;

    if affected == 0 {
        return Err("La ruta no existe".to_string());
    }

    Ok(())
}
