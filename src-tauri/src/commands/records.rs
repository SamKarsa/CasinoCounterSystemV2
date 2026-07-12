use super::*;
use crate::database::models::CounterRecordWithCalc;
use chrono::NaiveDate;
use rusqlite::{params, OptionalExtension};

const DATE_FMT: &str = "%Y-%m-%d";

// Fila cruda leída de CounterRecord, antes de calcular la liquidación
struct RawRecord {
    counter_record_id: i64,
    record_date: String,
    counter_in: i64,
    counter_out: i64,
    total_delivered: f64,
    is_baseline: bool,
}

fn map_raw_record(row: &rusqlite::Row) -> rusqlite::Result<RawRecord> {
    Ok(RawRecord {
        counter_record_id: row.get(0)?,
        record_date: row.get(1)?,
        counter_in: row.get(2)?,
        counter_out: row.get(3)?,
        total_delivered: row.get(4)?,
        is_baseline: row.get::<_, i64>(5)? != 0,
    })
}

// Lógica de negocio compartida: calcula un registro comparándolo contra el
// inmediatamente anterior. Baseline (o sin anterior) => sin cálculo.
// Poker: el IN-OUT usa solo el OUT; el resto de tipos usa (Δin - Δout).
fn calculate_record(
    current: &RawRecord,
    prev: Option<&RawRecord>,
    num_coin: i64,
    is_poker: bool,
) -> CounterRecordWithCalc {
    let (in_out, saldo, falta_sobra) = match (current.is_baseline, prev) {
        (false, Some(p)) => {
            let delta_in = current.counter_in - p.counter_in;
            let delta_out = current.counter_out - p.counter_out;
            let in_out = if is_poker {
                (delta_out as f64) * num_coin as f64
            } else {
                ((delta_in - delta_out) as f64) * num_coin as f64
            };
            let saldo = current.total_delivered / 2.0;
            let falta_sobra = current.total_delivered - in_out;
            (Some(in_out), Some(saldo), Some(falta_sobra))
        }
        _ => (None, None, None),
    };

    CounterRecordWithCalc {
        counter_record_id: current.counter_record_id,
        record_date: current.record_date.clone(),
        counter_in: current.counter_in,
        counter_out: current.counter_out,
        total_delivered: current.total_delivered,
        is_baseline: current.is_baseline,
        in_out,
        saldo,
        falta_sobra,
    }
}

// Datos de la máquina necesarios para el cálculo (iguales para todos sus
// registros): valor de la moneda y si el tipo es 'Poker'.
fn machine_calc_info(conn: &rusqlite::Connection, machine_id: i64) -> Result<(i64, bool), String> {
    conn.query_row(
        "SELECT c.numCoin, t.nameTypeMachine = 'Poker'
         FROM Machine m
         INNER JOIN CoinType c ON m.coinTypeId = c.coinTypeId
         INNER JOIN TypeMachine t ON m.typeMachineId = t.typeMachineId
         WHERE m.machineId = ?1",
        [machine_id],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)? != 0)),
    )
    .map_err(|e| {
        eprintln!("records: failed to read machine calc info: {}", e);
        "No se pudo obtener la información de la máquina".to_string()
    })
}

#[tauri::command]
pub fn get_records_by_machine(
    machine_id: i64,
    db: State<DbConnection>,
) -> Result<Vec<CounterRecordWithCalc>, String> {
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    let (num_coin, is_poker) = machine_calc_info(&conn, machine_id)?;

    let mut stmt = conn
        .prepare(
            "SELECT counterRecordId, recordDate, counterIn, counterOut,
                    totalDelivered, isBaseline
             FROM CounterRecord
             WHERE machineId = ?1
             ORDER BY recordDate ASC, counterRecordId ASC",
        )
        .map_err(|e| {
            eprintln!("records: failed to prepare statement: {}", e);
            "No se pudieron cargar los registros".to_string()
        })?;

    let rows = stmt.query_map([machine_id], map_raw_record).map_err(|e| {
        eprintln!("records: query failed: {}", e);
        "No se pudieron cargar los registros".to_string()
    })?;

    let mut raws: Vec<RawRecord> = Vec::new();
    for row in rows {
        raws.push(row.map_err(|e| {
            eprintln!("records: failed to read row: {}", e);
            "No se pudieron cargar los registros".to_string()
        })?);
    }

    // Una sola pasada: cada registro contra el inmediatamente anterior
    let mut result = Vec::with_capacity(raws.len());
    for i in 0..raws.len() {
        let prev = if i > 0 { Some(&raws[i - 1]) } else { None };
        result.push(calculate_record(&raws[i], prev, num_coin, is_poker));
    }

    Ok(result)
}

#[tauri::command]
pub fn create_counter_record(
    machine_id: i64,
    record_date: String,
    counter_in: i64,
    counter_out: i64,
    total_delivered: f64,
    db: State<DbConnection>,
) -> Result<CounterRecordWithCalc, String> {
    if counter_in < 0 || counter_out < 0 {
        return Err("Los contadores no pueden ser negativos".to_string());
    }
    if total_delivered < 0.0 {
        return Err("El total entregado no puede ser negativo".to_string());
    }

    let new_date = NaiveDate::parse_from_str(record_date.trim(), DATE_FMT)
        .map_err(|_| "La fecha no es válida".to_string())?;
    // Guardar siempre en formato canónico YYYY-MM-DD (orden y comparación consistentes)
    let record_date = new_date.format(DATE_FMT).to_string();

    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    let (num_coin, is_poker) = machine_calc_info(&conn, machine_id)?;

    // Último registro de la máquina (línea base o el previo más reciente)
    let last = conn
        .query_row(
            "SELECT counterRecordId, recordDate, counterIn, counterOut,
                    totalDelivered, isBaseline
             FROM CounterRecord
             WHERE machineId = ?1
             ORDER BY recordDate DESC, counterRecordId DESC
             LIMIT 1",
            [machine_id],
            map_raw_record,
        )
        .optional()
        .map_err(|e| {
            eprintln!("records: failed to read last record: {}", e);
            "No se pudo leer el último registro".to_string()
        })?;

    let last = last.ok_or_else(|| {
        "La máquina no tiene registro de instalación".to_string()
    })?;

    // Los contadores nunca retroceden (regla estricta)
    if counter_in < last.counter_in || counter_out < last.counter_out {
        return Err(format!(
            "Los contadores no pueden ser menores que los del último registro (IN: {}, OUT: {})",
            last.counter_in, last.counter_out
        ));
    }

    // La fecha no puede ser anterior a la del último registro (el mismo día sí se permite)
    let last_date = NaiveDate::parse_from_str(&last.record_date, DATE_FMT).map_err(|e| {
        eprintln!("records: corrupt date in last record: {}", e);
        "No se pudo validar la fecha del último registro".to_string()
    })?;
    if new_date < last_date {
        return Err(format!(
            "La fecha no puede ser anterior al último registro ({})",
            last.record_date
        ));
    }

    conn.execute(
        "INSERT INTO CounterRecord (recordDate, counterIn, counterOut, totalDelivered, isBaseline, machineId)
         VALUES (?1, ?2, ?3, ?4, 0, ?5)",
        params![record_date, counter_in, counter_out, total_delivered, machine_id],
    )
    .map_err(|e| {
        eprintln!("records: insert failed: {}", e);
        "No se pudo crear el registro".to_string()
    })?;

    let new_id = conn.last_insert_rowid();

    let current = RawRecord {
        counter_record_id: new_id,
        record_date,
        counter_in,
        counter_out,
        total_delivered,
        is_baseline: false,
    };

    // Mismo cálculo que get_records_by_machine, contra el registro anterior
    Ok(calculate_record(&current, Some(&last), num_coin, is_poker))
}

// Vecino (anterior o siguiente) de un registro dentro de su misma máquina,
// usando el orden (recordDate, counterRecordId).
fn neighbor_record(
    conn: &rusqlite::Connection,
    machine_id: i64,
    record_date: &str,
    counter_record_id: i64,
    previous: bool,
) -> Result<Option<RawRecord>, String> {
    let sql = if previous {
        "SELECT counterRecordId, recordDate, counterIn, counterOut, totalDelivered, isBaseline
         FROM CounterRecord
         WHERE machineId = ?1
           AND (recordDate < ?2 OR (recordDate = ?2 AND counterRecordId < ?3))
         ORDER BY recordDate DESC, counterRecordId DESC
         LIMIT 1"
    } else {
        "SELECT counterRecordId, recordDate, counterIn, counterOut, totalDelivered, isBaseline
         FROM CounterRecord
         WHERE machineId = ?1
           AND (recordDate > ?2 OR (recordDate = ?2 AND counterRecordId > ?3))
         ORDER BY recordDate ASC, counterRecordId ASC
         LIMIT 1"
    };

    conn.query_row(
        sql,
        params![machine_id, record_date, counter_record_id],
        map_raw_record,
    )
    .optional()
    .map_err(|e| {
        eprintln!("records: neighbor lookup failed: {}", e);
        "No se pudieron leer los registros vecinos".to_string()
    })
}

#[tauri::command]
pub fn update_counter_record(
    counter_record_id: i64,
    record_date: String,
    counter_in: i64,
    counter_out: i64,
    total_delivered: f64,
    db: State<DbConnection>,
) -> Result<CounterRecordWithCalc, String> {
    if counter_in < 0 || counter_out < 0 {
        return Err("Los contadores no pueden ser negativos".to_string());
    }
    if total_delivered < 0.0 {
        return Err("El total entregado no puede ser negativo".to_string());
    }

    let new_date = NaiveDate::parse_from_str(record_date.trim(), DATE_FMT)
        .map_err(|_| "La fecha no es válida".to_string())?;
    let record_date = new_date.format(DATE_FMT).to_string();

    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    // El registro a editar, con su machineId
    let target = conn
        .query_row(
            "SELECT counterRecordId, recordDate, counterIn, counterOut, totalDelivered, isBaseline, machineId
             FROM CounterRecord
             WHERE counterRecordId = ?1",
            [counter_record_id],
            |row| Ok((map_raw_record(row)?, row.get::<_, i64>(6)?)),
        )
        .optional()
        .map_err(|e| {
            eprintln!("records: failed to read target record: {}", e);
            "No se pudo leer el registro".to_string()
        })?;

    let (target, machine_id) = target.ok_or_else(|| "El registro no existe".to_string())?;

    let (num_coin, is_poker) = machine_calc_info(&conn, machine_id)?;

    if target.is_baseline {
        // La base solo es editable si es el ÚNICO registro de la máquina
        let real_records: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM CounterRecord WHERE machineId = ?1 AND isBaseline = 0",
                [machine_id],
                |row| row.get(0),
            )
            .map_err(|e| {
                eprintln!("records: record count failed: {}", e);
                "No se pudo actualizar el registro".to_string()
            })?;

        if real_records > 0 {
            return Err(
                "El registro de instalación solo se puede editar si no hay registros posteriores"
                    .to_string(),
            );
        }

        // La base no se liquida: totalDelivered se fuerza a 0 y sigue siendo baseline
        conn.execute(
            "UPDATE CounterRecord
             SET recordDate = ?1, counterIn = ?2, counterOut = ?3, totalDelivered = 0
             WHERE counterRecordId = ?4",
            params![record_date, counter_in, counter_out, counter_record_id],
        )
        .map_err(|e| {
            eprintln!("records: update baseline failed: {}", e);
            "No se pudo actualizar el registro".to_string()
        })?;

        let current = RawRecord {
            counter_record_id,
            record_date,
            counter_in,
            counter_out,
            total_delivered: 0.0,
            is_baseline: true,
        };

        // Baseline: los campos calculados salen en None
        return Ok(calculate_record(&current, None, num_coin, is_poker));
    }

    // Vecinos según la posición ACTUAL del registro
    let prev = neighbor_record(&conn, machine_id, &target.record_date, counter_record_id, true)?;
    let next = neighbor_record(&conn, machine_id, &target.record_date, counter_record_id, false)?;

    // Contra el anterior: contadores y fecha no pueden ser menores
    if let Some(prev) = &prev {
        if counter_in < prev.counter_in || counter_out < prev.counter_out {
            return Err(format!(
                "Los contadores no pueden ser menores que los del último registro (IN: {}, OUT: {})",
                prev.counter_in, prev.counter_out
            ));
        }
        let prev_date = NaiveDate::parse_from_str(&prev.record_date, DATE_FMT).map_err(|e| {
            eprintln!("records: corrupt date in previous record: {}", e);
            "No se pudo validar la fecha del registro anterior".to_string()
        })?;
        if new_date < prev_date {
            return Err(format!(
                "La fecha no puede ser anterior al último registro ({})",
                prev.record_date
            ));
        }
    }

    // Contra el siguiente: contadores y fecha no pueden ser mayores
    if let Some(next) = &next {
        if counter_in > next.counter_in || counter_out > next.counter_out {
            return Err(format!(
                "Los contadores no pueden ser mayores que los del registro siguiente (IN: {}, OUT: {})",
                next.counter_in, next.counter_out
            ));
        }
        let next_date = NaiveDate::parse_from_str(&next.record_date, DATE_FMT).map_err(|e| {
            eprintln!("records: corrupt date in next record: {}", e);
            "No se pudo validar la fecha del registro siguiente".to_string()
        })?;
        if new_date > next_date {
            return Err(format!(
                "La fecha no puede ser posterior al registro siguiente ({})",
                next.record_date
            ));
        }
    }

    conn.execute(
        "UPDATE CounterRecord
         SET recordDate = ?1, counterIn = ?2, counterOut = ?3, totalDelivered = ?4
         WHERE counterRecordId = ?5",
        params![record_date, counter_in, counter_out, total_delivered, counter_record_id],
    )
    .map_err(|e| {
        eprintln!("records: update failed: {}", e);
        "No se pudo actualizar el registro".to_string()
    })?;

    let current = RawRecord {
        counter_record_id,
        record_date,
        counter_in,
        counter_out,
        total_delivered,
        is_baseline: false,
    };

    // Recalculado contra su registro anterior (las validaciones garantizan que
    // sigue siendo el mismo vecino tras la edición)
    Ok(calculate_record(&current, prev.as_ref(), num_coin, is_poker))
}

#[tauri::command]
pub fn delete_counter_record(
    counter_record_id: i64,
    db: State<DbConnection>,
) -> Result<(), String> {
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    let is_baseline = conn
        .query_row(
            "SELECT isBaseline FROM CounterRecord WHERE counterRecordId = ?1",
            [counter_record_id],
            |row| Ok(row.get::<_, i64>(0)? != 0),
        )
        .optional()
        .map_err(|e| {
            eprintln!("records: baseline check failed: {}", e);
            "No se pudo eliminar el registro".to_string()
        })?;

    let is_baseline = is_baseline.ok_or_else(|| "El registro no existe".to_string())?;
    if is_baseline {
        return Err("El registro de instalación no se puede eliminar".to_string());
    }

    // El recálculo de los posteriores es automático: get_records_by_machine
    // compara cada registro contra el anterior que quede.
    conn.execute(
        "DELETE FROM CounterRecord WHERE counterRecordId = ?1",
        [counter_record_id],
    )
    .map_err(|e| {
        eprintln!("records: delete failed: {}", e);
        "No se pudo eliminar el registro".to_string()
    })?;

    Ok(())
}
