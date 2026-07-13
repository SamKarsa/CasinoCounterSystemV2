use super::*;
use crate::database::models::User;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2, PasswordHash, PasswordVerifier,
};
use rusqlite::{params, OptionalExtension};

const MIN_PASSWORD_LEN: usize = 6;
const MAX_USER_NAME_LEN: usize = 50;

// El operador se identifica por el nombre del rol, no por un id fijo: la BD
// migrada desde la app C# podría numerar los roles de otra forma.
const OPERATOR_ROLE: &str = "Counter Operator";

// Igual que en seed.rs, pero devolviendo Result: un comando no debe entrar en
// pánico si Argon2 falla.
fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| {
            eprintln!("users: argon2 hashing failed: {}", e);
            "No se pudo procesar la contraseña".to_string()
        })
}

fn validate_new_password(password: &str) -> Result<(), String> {
    if password.chars().count() < MIN_PASSWORD_LEN {
        return Err(format!(
            "La nueva contraseña debe tener al menos {} caracteres",
            MIN_PASSWORD_LEN
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn change_own_password(
    user_id: i64,
    current_password: String,
    new_password: String,
    db: State<DbConnection>,
) -> Result<(), String> {
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    let stored_hash: Option<String> = conn
        .query_row(
            "SELECT userPassword FROM Users WHERE userId = ?1 AND userStatus = 1",
            [user_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| {
            eprintln!("users: failed to read password hash: {}", e);
            "No se pudo actualizar la contraseña".to_string()
        })?;

    let stored_hash = stored_hash.ok_or_else(|| "El usuario no existe".to_string())?;

    let parsed_hash = PasswordHash::new(&stored_hash).map_err(|e| {
        eprintln!("users: corrupt password hash in DB: {}", e);
        "No se pudo actualizar la contraseña".to_string()
    })?;

    if Argon2::default()
        .verify_password(current_password.as_bytes(), &parsed_hash)
        .is_err()
    {
        return Err("La contraseña actual es incorrecta".to_string());
    }

    validate_new_password(&new_password)?;

    let affected = conn
        .execute(
            "UPDATE Users SET userPassword = ?1 WHERE userId = ?2",
            params![hash_password(&new_password)?, user_id],
        )
        .map_err(|e| {
            eprintln!("users: password update failed: {}", e);
            "No se pudo actualizar la contraseña".to_string()
        })?;

    if affected == 0 {
        return Err("El usuario no existe".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn get_operator(db: State<DbConnection>) -> Result<User, String> {
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    conn.query_row(
        "SELECT u.userId, u.userName, u.userStatus, u.roleId, r.roleName
         FROM Users u
         INNER JOIN Role r ON u.roleId = r.roleId
         WHERE r.roleName = ?1
         LIMIT 1",
        [OPERATOR_ROLE],
        |row| {
            Ok(User {
                user_id: row.get(0)?,
                user_name: row.get(1)?,
                user_status: row.get(2)?,
                role_id: row.get(3)?,
                role_name: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(|e| {
        eprintln!("users: operator query failed: {}", e);
        "No se pudo cargar el operador".to_string()
    })?
    .ok_or_else(|| "No existe un usuario operador".to_string())
}

#[tauri::command]
pub fn update_operator(
    user_name: String,
    new_password: Option<String>,
    db: State<DbConnection>,
) -> Result<User, String> {
    let name = user_name.trim();

    if name.is_empty() {
        return Err("El nombre de usuario no puede estar vacío".to_string());
    }
    if name.chars().count() > MAX_USER_NAME_LEN {
        return Err(format!(
            "El nombre de usuario no puede superar {} caracteres",
            MAX_USER_NAME_LEN
        ));
    }

    // Contraseña vacía (o ausente) = no cambiarla. No se hace trim: un espacio
    // puede ser parte legítima de la contraseña.
    let new_password = new_password.filter(|p| !p.is_empty());
    if let Some(password) = &new_password {
        validate_new_password(password)?;
    }

    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    let operator: Option<(i64, i64, bool)> = conn
        .query_row(
            "SELECT u.userId, u.roleId, u.userStatus
             FROM Users u
             INNER JOIN Role r ON u.roleId = r.roleId
             WHERE r.roleName = ?1
             LIMIT 1",
            [OPERATOR_ROLE],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|e| {
            eprintln!("users: operator lookup failed: {}", e);
            "No se pudo actualizar el operador".to_string()
        })?;

    let (user_id, role_id, user_status) =
        operator.ok_or_else(|| "No existe un usuario operador".to_string())?;

    // Unicidad (case-insensitive) excluyendo al propio operador: puede conservar su nombre
    let exists = conn
        .query_row(
            "SELECT 1 FROM Users WHERE userName = ?1 COLLATE NOCASE AND userId != ?2 LIMIT 1",
            params![name, user_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| {
            eprintln!("users: duplicate check failed: {}", e);
            "No se pudo actualizar el operador".to_string()
        })?;
    if exists.is_some() {
        return Err("Ya existe un usuario con ese nombre".to_string());
    }

    let affected = match &new_password {
        Some(password) => conn.execute(
            "UPDATE Users SET userName = ?1, userPassword = ?2 WHERE userId = ?3",
            params![name, hash_password(password)?, user_id],
        ),
        None => conn.execute(
            "UPDATE Users SET userName = ?1 WHERE userId = ?2",
            params![name, user_id],
        ),
    }
    .map_err(|e| {
        if let rusqlite::Error::SqliteFailure(err, _) = &e {
            if err.code == rusqlite::ErrorCode::ConstraintViolation {
                return "Ya existe un usuario con ese nombre".to_string();
            }
        }
        eprintln!("users: update failed: {}", e);
        "No se pudo actualizar el operador".to_string()
    })?;

    if affected == 0 {
        return Err("No existe un usuario operador".to_string());
    }

    Ok(User {
        user_id,
        user_name: name.to_string(),
        user_status,
        role_id,
        role_name: OPERATOR_ROLE.to_string(),
    })
}
