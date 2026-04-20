use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub mod models;
pub mod seed;

pub fn init_database(db_path: PathBuf) -> Result<Connection> {
    println!("Database path: {:?}", db_path);

    let conn = Connection::open(&db_path)?;
    
    // Optimizaciones para SQLite
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA cache_size = 10000;
         PRAGMA temp_store = MEMORY;
         PRAGMA foreign_keys = ON;"
    )?;
    
    // Crear tablas
    create_tables(&conn)?;
    
    // Insertar datos iniciales
    seed::seed_initial_data(&conn)?;
    
    println!("Database initialized successfully");
    
    Ok(conn)
}

fn create_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS Role (
            roleId INTEGER PRIMARY KEY AUTOINCREMENT,
            roleName TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS Users (
            userId INTEGER PRIMARY KEY AUTOINCREMENT,
            userName TEXT NOT NULL,
            userPassword TEXT NOT NULL,
            userStatus INTEGER NOT NULL DEFAULT 1,
            roleId INTEGER NOT NULL,
            FOREIGN KEY (roleId) REFERENCES Role(roleId)
        );

        CREATE TABLE IF NOT EXISTS Route (
            routeId INTEGER PRIMARY KEY AUTOINCREMENT,
            routeName TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS TypeMachine (
            typeMachineId INTEGER PRIMARY KEY AUTOINCREMENT,
            nameTypeMachine TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS CoinType (
            coinTypeId INTEGER PRIMARY KEY AUTOINCREMENT,
            numCoin INTEGER NOT NULL UNIQUE,
            CHECK (numCoin > 0)
        );

        CREATE TABLE IF NOT EXISTS Machine (
            machineId INTEGER PRIMARY KEY AUTOINCREMENT,
            numberMachine TEXT NOT NULL UNIQUE,
            typeMachineId INTEGER NOT NULL,
            coinTypeId INTEGER NOT NULL,
            routeId INTEGER NOT NULL,
            FOREIGN KEY (typeMachineId) REFERENCES TypeMachine(typeMachineId),
            FOREIGN KEY (coinTypeId) REFERENCES CoinType(coinTypeId),
            FOREIGN KEY (routeId) REFERENCES Route(routeId)
        );

        CREATE TABLE IF NOT EXISTS InfoMachine (
            infoMachineId INTEGER PRIMARY KEY,
            nameClient TEXT,
            phone TEXT,
            address TEXT,
            FOREIGN KEY (infoMachineId) REFERENCES Machine(machineId) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS CounterRecord (
            counterRecordId INTEGER PRIMARY KEY AUTOINCREMENT,
            recordDate TEXT NOT NULL,
            counterIn INTEGER NOT NULL,
            counterOut INTEGER NOT NULL,
            totalDelivered REAL NOT NULL,
            machineId INTEGER NOT NULL,
            FOREIGN KEY (machineId) REFERENCES Machine(machineId),
            CHECK (counterIn >= 0 AND counterOut >= 0),
            CHECK (totalDelivered >= 0)
        );

        CREATE INDEX IF NOT EXISTS idx_machine_route ON Machine(routeId);
        CREATE INDEX IF NOT EXISTS idx_counterrecord_machine ON CounterRecord(machineId);
        CREATE INDEX IF NOT EXISTS idx_counterrecord_date ON CounterRecord(recordDate);"
    )?;
    
    Ok(())
}