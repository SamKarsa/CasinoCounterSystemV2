use super::*;
use crate::database::models::User;
use argon2::{Argon2, PasswordHash, PasswordVerifier};

#[tauri::command]
pub fn authenticate_user(
    username: String,
    password: String,
    db: State<DbConnection>,
) -> Result<User, String> {
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT u.userId, u.userName, u.userPassword, u.roleId, r.roleName
             FROM Users u
             INNER JOIN Role r ON u.roleId = r.roleId
             WHERE u.userName = ?1 AND u.userStatus = 1",
        )
        .map_err(|e| {
            eprintln!("auth: failed to prepare statement: {}", e);
            "Invalid credentials".to_string()
        })?;

    let user = stmt
        .query_row([&username], |row| {
            let stored_hash: String = row.get(2)?;

            let parsed_hash = PasswordHash::new(&stored_hash).map_err(|e| {
                eprintln!("auth: corrupt password hash in DB: {}", e);
                rusqlite::Error::QueryReturnedNoRows
            })?;

            if Argon2::default()
                .verify_password(password.as_bytes(), &parsed_hash)
                .is_ok()
            {
                Ok(User {
                    user_id: row.get(0)?,
                    user_name: row.get(1)?,
                    user_status: true,
                    role_id: row.get(3)?,
                    role_name: row.get(4)?,
                })
            } else {
                Err(rusqlite::Error::QueryReturnedNoRows)
            }
        })
        .map_err(|e| {
            if !matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                eprintln!("auth: query failed: {}", e);
            }
            "Invalid credentials".to_string()
        })?;

    Ok(user)
}
