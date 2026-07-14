use super::*;
use crate::database::models::{CoinType, Machine, TypeMachine};
use chrono::Local;
use rusqlite::{params, OptionalExtension};

const MAX_MACHINE_NUMBER_LEN: usize = 50;

// SELECT reutilizable con los JOIN que llenan los campos de display del struct Machine
const MACHINE_SELECT: &str = "SELECT m.machineId, m.numberMachine, m.typeMachineId,
            t.nameTypeMachine, m.coinTypeId, c.numCoin, m.routeId, r.routeName
     FROM Machine m
     INNER JOIN TypeMachine t ON m.typeMachineId = t.typeMachineId
     INNER JOIN CoinType c ON m.coinTypeId = c.coinTypeId
     INNER JOIN Route r ON m.routeId = r.routeId";

fn map_machine_row(row: &rusqlite::Row) -> rusqlite::Result<Machine> {
    Ok(Machine {
        machine_id: row.get(0)?,
        number_machine: row.get(1)?,
        type_machine_id: row.get(2)?,
        type_machine_name: row.get(3)?,
        coin_type_id: row.get(4)?,
        num_coin: row.get(5)?,
        route_id: row.get(6)?,
        route_name: row.get(7)?,
    })
}

#[tauri::command]
pub fn get_all_type_machines(db: State<DbConnection>) -> Result<Vec<TypeMachine>, String> {
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT typeMachineId, nameTypeMachine FROM TypeMachine ORDER BY nameTypeMachine")
        .map_err(|e| {
            eprintln!("machines: failed to prepare statement: {}", e);
            "No se pudieron cargar los tipos de máquina".to_string()
        })?;

    let rows = stmt
        .query_map([], |row| {
            Ok(TypeMachine {
                type_machine_id: row.get(0)?,
                name_type_machine: row.get(1)?,
            })
        })
        .map_err(|e| {
            eprintln!("machines: query failed: {}", e);
            "No se pudieron cargar los tipos de máquina".to_string()
        })?;

    let mut items = Vec::new();
    for item in rows {
        items.push(item.map_err(|e| {
            eprintln!("machines: failed to read row: {}", e);
            "No se pudieron cargar los tipos de máquina".to_string()
        })?);
    }

    Ok(items)
}

#[tauri::command]
pub fn get_all_coin_types(db: State<DbConnection>) -> Result<Vec<CoinType>, String> {
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT coinTypeId, numCoin FROM CoinType ORDER BY numCoin")
        .map_err(|e| {
            eprintln!("machines: failed to prepare statement: {}", e);
            "No se pudieron cargar las denominaciones".to_string()
        })?;

    let rows = stmt
        .query_map([], |row| {
            Ok(CoinType {
                coin_type_id: row.get(0)?,
                num_coin: row.get(1)?,
            })
        })
        .map_err(|e| {
            eprintln!("machines: query failed: {}", e);
            "No se pudieron cargar las denominaciones".to_string()
        })?;

    let mut items = Vec::new();
    for item in rows {
        items.push(item.map_err(|e| {
            eprintln!("machines: failed to read row: {}", e);
            "No se pudieron cargar las denominaciones".to_string()
        })?);
    }

    Ok(items)
}

#[tauri::command]
pub fn get_machines_by_route(route_id: i64, db: State<DbConnection>) -> Result<Vec<Machine>, String> {
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    // El ORDER BY es solo un pre-orden: el orden final lo da natural_cmp, que
    // SQLite no sabe hacer (para él "A100" va antes que "A11").
    let sql = format!("{} WHERE m.routeId = ?1 ORDER BY m.numberMachine", MACHINE_SELECT);

    let mut stmt = conn.prepare(&sql).map_err(|e| {
        eprintln!("machines: failed to prepare statement: {}", e);
        "No se pudieron cargar las máquinas".to_string()
    })?;

    let rows = stmt.query_map([route_id], map_machine_row).map_err(|e| {
        eprintln!("machines: query failed: {}", e);
        "No se pudieron cargar las máquinas".to_string()
    })?;

    let mut machines = Vec::new();
    for machine in rows {
        machines.push(machine.map_err(|e| {
            eprintln!("machines: failed to read row: {}", e);
            "No se pudieron cargar las máquinas".to_string()
        })?);
    }

    machines.sort_by(|a, b| natural_cmp(&a.number_machine, &b.number_machine));

    Ok(machines)
}

#[tauri::command]
pub fn create_machine(
    number_machine: String,
    type_machine_id: i64,
    coin_type_id: i64,
    route_id: i64,
    initial_in: i64,
    initial_out: i64,
    db: State<DbConnection>,
) -> Result<Machine, String> {
    let number = number_machine.trim();

    if number.is_empty() {
        return Err("El número de la máquina no puede estar vacío".to_string());
    }
    if number.chars().count() > MAX_MACHINE_NUMBER_LEN {
        return Err(format!(
            "El número de la máquina no puede superar {} caracteres",
            MAX_MACHINE_NUMBER_LEN
        ));
    }
    if initial_in < 0 || initial_out < 0 {
        return Err("Los contadores iniciales no pueden ser negativos".to_string());
    }

    let mut conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    // Unicidad del número sin distinguir mayúsculas/minúsculas: "A01" y "a01"
    // chocan. COLLATE NOCASE aplica en la consulta (no depende del esquema,
    // funciona también sobre una BD migrada desde la app C#).
    let exists = conn
        .query_row(
            "SELECT 1 FROM Machine WHERE numberMachine = ?1 COLLATE NOCASE LIMIT 1",
            [number],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| {
            eprintln!("machines: duplicate check failed: {}", e);
            "No se pudo crear la máquina".to_string()
        })?;
    if exists.is_some() {
        return Err("Ya existe una máquina con ese número".to_string());
    }

    let today = Local::now().format("%Y-%m-%d").to_string();

    // La máquina y su primer registro (línea base) deben nacer juntos o no nacer
    let tx = conn.transaction().map_err(|e| {
        eprintln!("machines: failed to start transaction: {}", e);
        "No se pudo crear la máquina".to_string()
    })?;

    tx.execute(
        "INSERT INTO Machine (numberMachine, typeMachineId, coinTypeId, routeId)
         VALUES (?1, ?2, ?3, ?4)",
        params![number, type_machine_id, coin_type_id, route_id],
    )
    .map_err(|e| {
        // numberMachine es UNIQUE; distinguirlo de una violación de FK (id inexistente)
        if let rusqlite::Error::SqliteFailure(err, ref msg) = e {
            if err.code == rusqlite::ErrorCode::ConstraintViolation
                && msg.as_deref().is_some_and(|m| m.contains("UNIQUE"))
            {
                return "Ya existe una máquina con ese número".to_string();
            }
        }
        eprintln!("machines: insert machine failed: {}", e);
        "No se pudo crear la máquina".to_string()
    })?;

    let machine_id = tx.last_insert_rowid();

    // Primer registro: línea base de instalación. No se liquida (totalDelivered = 0);
    // los cálculos comparan cada registro contra el anterior y este no tiene anterior.
    tx.execute(
        "INSERT INTO CounterRecord (recordDate, counterIn, counterOut, totalDelivered, isBaseline, machineId)
         VALUES (?1, ?2, ?3, 0, 1, ?4)",
        params![today, initial_in, initial_out, machine_id],
    )
    .map_err(|e| {
        eprintln!("machines: insert baseline record failed: {}", e);
        "No se pudo crear la máquina".to_string()
    })?;

    tx.commit().map_err(|e| {
        eprintln!("machines: commit failed: {}", e);
        "No se pudo crear la máquina".to_string()
    })?;

    // Releer con los JOIN para devolver los campos de display llenos
    let sql = format!("{} WHERE m.machineId = ?1", MACHINE_SELECT);
    conn.query_row(&sql, [machine_id], map_machine_row).map_err(|e| {
        eprintln!("machines: failed to reload created machine: {}", e);
        "No se pudo crear la máquina".to_string()
    })
}

#[tauri::command]
pub fn update_machine(
    machine_id: i64,
    number_machine: String,
    type_machine_id: i64,
    coin_type_id: i64,
    route_id: i64,
    db: State<DbConnection>,
) -> Result<Machine, String> {
    let number = number_machine.trim();

    if number.is_empty() {
        return Err("El número de la máquina no puede estar vacío".to_string());
    }
    if number.chars().count() > MAX_MACHINE_NUMBER_LEN {
        return Err(format!(
            "El número de la máquina no puede superar {} caracteres",
            MAX_MACHINE_NUMBER_LEN
        ));
    }

    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    // Unicidad del número (case-insensitive) excluyendo la propia máquina
    let exists = conn
        .query_row(
            "SELECT 1 FROM Machine WHERE numberMachine = ?1 COLLATE NOCASE AND machineId != ?2 LIMIT 1",
            params![number, machine_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| {
            eprintln!("machines: duplicate check failed: {}", e);
            "No se pudo actualizar la máquina".to_string()
        })?;
    if exists.is_some() {
        return Err("Ya existe una máquina con ese número".to_string());
    }

    let affected = conn
        .execute(
            "UPDATE Machine
             SET numberMachine = ?1, typeMachineId = ?2, coinTypeId = ?3, routeId = ?4
             WHERE machineId = ?5",
            params![number, type_machine_id, coin_type_id, route_id, machine_id],
        )
        .map_err(|e| {
            // numberMachine es UNIQUE; distinguirlo de una violación de FK (id inexistente)
            if let rusqlite::Error::SqliteFailure(err, ref msg) = e {
                if err.code == rusqlite::ErrorCode::ConstraintViolation
                    && msg.as_deref().is_some_and(|m| m.contains("UNIQUE"))
                {
                    return "Ya existe una máquina con ese número".to_string();
                }
            }
            eprintln!("machines: update failed: {}", e);
            "No se pudo actualizar la máquina".to_string()
        })?;

    if affected == 0 {
        return Err("La máquina no existe".to_string());
    }

    // Releer con los JOIN para devolver los campos de display llenos
    let sql = format!("{} WHERE m.machineId = ?1", MACHINE_SELECT);
    conn.query_row(&sql, [machine_id], map_machine_row).map_err(|e| {
        eprintln!("machines: failed to reload updated machine: {}", e);
        "No se pudo actualizar la máquina".to_string()
    })
}

#[tauri::command]
pub fn delete_machine(machine_id: i64, db: State<DbConnection>) -> Result<(), String> {
    let mut conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    // Registros reales (los que no son la línea base de instalación)
    let real_records: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM CounterRecord WHERE machineId = ?1 AND isBaseline = 0",
            [machine_id],
            |row| row.get(0),
        )
        .map_err(|e| {
            eprintln!("machines: record count failed: {}", e);
            "No se pudo eliminar la máquina".to_string()
        })?;

    if real_records > 0 {
        return Err("No se puede eliminar: la máquina tiene registros".to_string());
    }

    // El registro base y la máquina se borran juntos o no se borran
    let tx = conn.transaction().map_err(|e| {
        eprintln!("machines: failed to start transaction: {}", e);
        "No se pudo eliminar la máquina".to_string()
    })?;

    tx.execute(
        "DELETE FROM CounterRecord WHERE machineId = ?1",
        [machine_id],
    )
    .map_err(|e| {
        eprintln!("machines: delete baseline record failed: {}", e);
        "No se pudo eliminar la máquina".to_string()
    })?;

    let affected = tx
        .execute("DELETE FROM Machine WHERE machineId = ?1", [machine_id])
        .map_err(|e| {
            eprintln!("machines: delete machine failed: {}", e);
            "No se pudo eliminar la máquina".to_string()
        })?;

    if affected == 0 {
        return Err("La máquina no existe".to_string());
    }

    tx.commit().map_err(|e| {
        eprintln!("machines: commit failed: {}", e);
        "No se pudo eliminar la máquina".to_string()
    })?;

    Ok(())
}
