use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use rusqlite::{params, Connection, Result};

fn hash_password(password: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .expect("argon2 hashing failed")
        .to_string()
}

pub fn seed_initial_data(conn: &Connection) -> Result<()> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM Role",
        [],
        |row| row.get(0)
    )?;

    if count == 0 {
        conn.execute_batch(
            "INSERT INTO Role (roleId, roleName) VALUES
             (1, 'Admin'),
             (2, 'Counter Operator');

             INSERT INTO TypeMachine (typeMachineId, nameTypeMachine) VALUES
             (1, 'Poker'),
             (2, 'MultiGame'),
             (3, 'Pimball'),
             (4, 'MultiPoker'),
             (5, 'Duende'),
             (6, 'Pikachu');

             INSERT INTO CoinType (coinTypeId, numCoin) VALUES
             (1, 10),
             (2, 50),
             (3, 100),
             (4, 200),
             (5, 500),
             (6, 1000);"
        )?;

        conn.execute(
            "INSERT INTO Users (userId, userName, userPassword, userStatus, roleId)
             VALUES (1, ?1, ?2, 1, 1)",
            params!["admin", hash_password("admin123")],
        )?;
        conn.execute(
            "INSERT INTO Users (userId, userName, userPassword, userStatus, roleId)
             VALUES (2, ?1, ?2, 1, 2)",
            params!["operator", hash_password("operator123")],
        )?;

        println!("Initial data seeded");
    }

    Ok(())
}
