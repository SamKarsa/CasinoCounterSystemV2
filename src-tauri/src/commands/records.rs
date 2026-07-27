use super::*;
use crate::database::models::{CounterRecordWithCalc, RouteSummary, RouteSummaryMachine};
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
    let (in_out, falta_sobra) = match (current.is_baseline, prev) {
        (false, Some(p)) => {
            let delta_in = current.counter_in - p.counter_in;
            let delta_out = current.counter_out - p.counter_out;
            let in_out = if is_poker {
                (delta_out as f64) * num_coin as f64
            } else {
                ((delta_in - delta_out) as f64) * num_coin as f64
            };
            let falta_sobra = current.total_delivered - in_out;
            (Some(in_out), Some(falta_sobra))
        }
        _ => (None, None),
    };

    CounterRecordWithCalc {
        counter_record_id: current.counter_record_id,
        record_date: current.record_date.clone(),
        counter_in: current.counter_in,
        counter_out: current.counter_out,
        total_delivered: current.total_delivered,
        is_baseline: current.is_baseline,
        in_out,
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

// Reinicio de contadores: cuando a una máquina le cambian la tarjeta y los
// contadores vuelven a cero (o a otros valores), se inserta un baseline nuevo
// (isBaseline = 1) al final de la cadena. No se liquida y sirve de referencia
// para el registro siguiente. Una máquina puede tener varios baselines: el
// primero es la instalación, los demás son reinicios.
#[tauri::command]
pub fn create_baseline_record(
    machine_id: i64,
    record_date: String,
    counter_in: i64,
    counter_out: i64,
    db: State<DbConnection>,
) -> Result<CounterRecordWithCalc, String> {
    if counter_in < 0 || counter_out < 0 {
        return Err("Los contadores no pueden ser negativos".to_string());
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

    // Un reinicio corta una cadena existente: la máquina debe tener registros
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

    let last = last.ok_or_else(|| "La máquina no tiene registros".to_string())?;

    // SOLO se valida la fecha: el sentido del reinicio es que los contadores
    // bajaron, así que no se comparan contra los del último registro.
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

    // isBaseline = 1 y totalDelivered = 0 forzado (un baseline no se liquida)
    conn.execute(
        "INSERT INTO CounterRecord (recordDate, counterIn, counterOut, totalDelivered, isBaseline, machineId)
         VALUES (?1, ?2, ?3, 0, 1, ?4)",
        params![record_date, counter_in, counter_out, machine_id],
    )
    .map_err(|e| {
        eprintln!("records: baseline insert failed: {}", e);
        "No se pudo reiniciar los contadores".to_string()
    })?;

    let new_id = conn.last_insert_rowid();

    let current = RawRecord {
        counter_record_id: new_id,
        record_date,
        counter_in,
        counter_out,
        total_delivered: 0.0,
        is_baseline: true,
    };

    // Baseline: los campos calculados salen en None
    Ok(calculate_record(&current, None, num_coin, is_poker))
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
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    update_counter_record_impl(
        &conn,
        counter_record_id,
        record_date,
        counter_in,
        counter_out,
        total_delivered,
    )
}

// Regla UNIFICADA de validación de la edición. Un baseline (instalación o
// reinicio) corta la cadena: el registro posterior se calcula contra el
// baseline, no contra lo anterior.
// - Contra el vecino ANTERIOR: la fecha siempre; los contadores solo si el
//   registro editado NO es baseline (un baseline arranca de nuevo, sus
//   contadores pueden ser menores que los del ciclo anterior).
// - Contra el vecino SIGUIENTE: la fecha siempre; los contadores solo si el
//   siguiente NO es baseline (un baseline corta la cadena).
// - Si el editado es baseline: totalDelivered se fuerza a 0 y sigue siendo baseline.
fn update_counter_record_impl(
    conn: &Connection,
    counter_record_id: i64,
    record_date: String,
    counter_in: i64,
    counter_out: i64,
    total_delivered: f64,
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

    let (num_coin, is_poker) = machine_calc_info(conn, machine_id)?;

    // Vecinos según la posición ACTUAL del registro
    let prev = neighbor_record(conn, machine_id, &target.record_date, counter_record_id, true)?;
    let next = neighbor_record(conn, machine_id, &target.record_date, counter_record_id, false)?;

    // Contra el anterior: fecha siempre; contadores solo si el editado NO es baseline
    if let Some(prev) = &prev {
        if !target.is_baseline && (counter_in < prev.counter_in || counter_out < prev.counter_out) {
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

    // Contra el siguiente: fecha siempre; contadores solo si el siguiente NO es baseline
    if let Some(next) = &next {
        if !next.is_baseline && (counter_in > next.counter_in || counter_out > next.counter_out) {
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

    // Un baseline no se liquida: totalDelivered se fuerza a 0 y sigue siendo baseline
    let stored_total = if target.is_baseline { 0.0 } else { total_delivered };

    conn.execute(
        "UPDATE CounterRecord
         SET recordDate = ?1, counterIn = ?2, counterOut = ?3, totalDelivered = ?4
         WHERE counterRecordId = ?5",
        params![record_date, counter_in, counter_out, stored_total, counter_record_id],
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
        total_delivered: stored_total,
        is_baseline: target.is_baseline,
    };

    // Baseline: sin cálculo (calculate_record devuelve None). Normal: contra su anterior.
    let prev_for_calc = if target.is_baseline { None } else { prev.as_ref() };
    Ok(calculate_record(&current, prev_for_calc, num_coin, is_poker))
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

    delete_counter_record_impl(&conn, counter_record_id)
}

fn delete_counter_record_impl(conn: &Connection, counter_record_id: i64) -> Result<(), String> {
    let target = conn
        .query_row(
            "SELECT recordDate, isBaseline, machineId FROM CounterRecord WHERE counterRecordId = ?1",
            [counter_record_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)? != 0,
                    row.get::<_, i64>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|e| {
            eprintln!("records: baseline check failed: {}", e);
            "No se pudo eliminar el registro".to_string()
        })?;

    let (record_date, is_baseline, machine_id) =
        target.ok_or_else(|| "El registro no existe".to_string())?;

    if is_baseline {
        // El baseline MÁS ANTIGUO (la instalación) es intocable.
        let oldest_baseline_id: i64 = conn
            .query_row(
                "SELECT counterRecordId FROM CounterRecord
                 WHERE machineId = ?1 AND isBaseline = 1
                 ORDER BY recordDate ASC, counterRecordId ASC
                 LIMIT 1",
                [machine_id],
                |row| row.get(0),
            )
            .map_err(|e| {
                eprintln!("records: oldest baseline lookup failed: {}", e);
                "No se pudo eliminar el registro".to_string()
            })?;

        if counter_record_id == oldest_baseline_id {
            return Err("El registro de instalación no se puede eliminar".to_string());
        }

        // Un reinicio con registros posteriores no se puede borrar: dejaría a los
        // siguientes calculando contra contadores de otro ciclo (valores sin sentido).
        let has_later =
            neighbor_record(conn, machine_id, &record_date, counter_record_id, false)?.is_some();
        if has_later {
            return Err(
                "No se puede eliminar el reinicio porque tiene registros posteriores".to_string(),
            );
        }
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

#[tauri::command]
pub fn get_route_summary(
    route_id: i64,
    from_date: String,
    to_date: String,
    db: State<DbConnection>,
) -> Result<RouteSummary, String> {
    let invalid_range = || "El rango de fechas no es válido".to_string();

    let from = NaiveDate::parse_from_str(from_date.trim(), DATE_FMT).map_err(|_| invalid_range())?;
    let to = NaiveDate::parse_from_str(to_date.trim(), DATE_FMT).map_err(|_| invalid_range())?;
    if from > to {
        return Err(invalid_range());
    }

    // Formato canónico: las fechas se guardan así, y la comparación del rango se
    // hace como texto (mismo criterio que el ORDER BY recordDate del esquema).
    let from_date = from.format(DATE_FMT).to_string();
    let to_date = to.format(DATE_FMT).to_string();

    let conn = db
        .0
        .lock()
        .map_err(|e| format!("DB lock poisoned: {}", e))?;

    let route_name: Option<String> = conn
        .query_row(
            "SELECT routeName FROM Route WHERE routeId = ?1",
            [route_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| {
            eprintln!("records: route lookup failed: {}", e);
            "No se pudo cargar el resumen".to_string()
        })?;

    let route_name = route_name.ok_or_else(|| "La ruta no existe".to_string())?;

    // numCoin y el flag de Poker vienen en la misma consulta: evita un
    // machine_calc_info por máquina (~120 por ruta).
    let mut machines_stmt = conn
        .prepare(
            "SELECT m.machineId, m.numberMachine, t.nameTypeMachine, c.numCoin,
                    t.nameTypeMachine = 'Poker'
             FROM Machine m
             INNER JOIN CoinType c ON m.coinTypeId = c.coinTypeId
             INNER JOIN TypeMachine t ON m.typeMachineId = t.typeMachineId
             WHERE m.routeId = ?1
             ORDER BY m.numberMachine",
        )
        .map_err(|e| {
            eprintln!("records: failed to prepare machines statement: {}", e);
            "No se pudo cargar el resumen".to_string()
        })?;

    let machine_rows = machines_stmt
        .query_map([route_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)? != 0,
            ))
        })
        .map_err(|e| {
            eprintln!("records: machines query failed: {}", e);
            "No se pudo cargar el resumen".to_string()
        })?;

    let mut machines_info = Vec::new();
    for row in machine_rows {
        machines_info.push(row.map_err(|e| {
            eprintln!("records: failed to read machine row: {}", e);
            "No se pudo cargar el resumen".to_string()
        })?);
    }

    let mut records_stmt = conn
        .prepare(
            "SELECT counterRecordId, recordDate, counterIn, counterOut,
                    totalDelivered, isBaseline
             FROM CounterRecord
             WHERE machineId = ?1
             ORDER BY recordDate ASC, counterRecordId ASC",
        )
        .map_err(|e| {
            eprintln!("records: failed to prepare records statement: {}", e);
            "No se pudo cargar el resumen".to_string()
        })?;

    let mut machines = Vec::with_capacity(machines_info.len());

    for (machine_id, number_machine, type_machine_name, num_coin, is_poker) in machines_info {
        // Se cargan TODOS los registros de la máquina, no solo los del rango: cada
        // uno se calcula contra su anterior real, que puede quedar fuera del rango.
        let rows = records_stmt
            .query_map([machine_id], map_raw_record)
            .map_err(|e| {
                eprintln!("records: records query failed: {}", e);
                "No se pudo cargar el resumen".to_string()
            })?;

        let mut raws: Vec<RawRecord> = Vec::new();
        for row in rows {
            raws.push(row.map_err(|e| {
                eprintln!("records: failed to read record row: {}", e);
                "No se pudo cargar el resumen".to_string()
            })?);
        }

        let mut in_out = 0.0;
        let mut total = 0.0;
        let mut falta_sobra = 0.0;
        let mut liquidated = false;

        for i in 0..raws.len() {
            let prev = if i > 0 { Some(&raws[i - 1]) } else { None };
            let calc = calculate_record(&raws[i], prev, num_coin, is_poker);

            if calc.is_baseline
                || calc.record_date < from_date
                || calc.record_date > to_date
            {
                continue;
            }

            liquidated = true;
            in_out += calc.in_out.unwrap_or(0.0);
            total += calc.total_delivered;
            falta_sobra += calc.falta_sobra.unwrap_or(0.0);
        }

        machines.push(RouteSummaryMachine {
            machine_id,
            number_machine,
            type_machine_name,
            liquidated,
            in_out,
            total,
            falta_sobra,
        });
    }

    // Orden natural (A2 < A10 < A100); el ORDER BY del SQL es solo un pre-orden
    machines.sort_by(|a, b| natural_cmp(&a.number_machine, &b.number_machine));

    let machines_total = machines.len() as i64;
    let machines_liquidated = machines.iter().filter(|m| m.liquidated).count() as i64;
    let total_in_out = machines.iter().map(|m| m.in_out).sum();
    let total_delivered = machines.iter().map(|m| m.total).sum();
    let total_falta_sobra = machines.iter().map(|m| m.falta_sobra).sum();

    Ok(RouteSummary {
        route_id,
        route_name,
        from_date,
        to_date,
        machines,
        total_in_out,
        total_delivered,
        total_falta_sobra,
        machines_liquidated,
        machines_total,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // BD en memoria con el esquema mínimo y una máquina (tipo no-Poker, moneda 100)
    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE TypeMachine (
                typeMachineId INTEGER PRIMARY KEY AUTOINCREMENT,
                nameTypeMachine TEXT NOT NULL UNIQUE
            );
            CREATE TABLE CoinType (
                coinTypeId INTEGER PRIMARY KEY AUTOINCREMENT,
                numCoin INTEGER NOT NULL UNIQUE
            );
            CREATE TABLE Machine (
                machineId INTEGER PRIMARY KEY AUTOINCREMENT,
                numberMachine TEXT NOT NULL UNIQUE,
                typeMachineId INTEGER NOT NULL,
                coinTypeId INTEGER NOT NULL,
                routeId INTEGER NOT NULL
            );
            CREATE TABLE CounterRecord (
                counterRecordId INTEGER PRIMARY KEY AUTOINCREMENT,
                recordDate TEXT NOT NULL,
                counterIn INTEGER NOT NULL,
                counterOut INTEGER NOT NULL,
                totalDelivered REAL NOT NULL,
                isBaseline INTEGER NOT NULL DEFAULT 0,
                machineId INTEGER NOT NULL
            );
            INSERT INTO TypeMachine (typeMachineId, nameTypeMachine) VALUES (1, 'Slot');
            INSERT INTO CoinType (coinTypeId, numCoin) VALUES (1, 100);
            INSERT INTO Machine (machineId, numberMachine, typeMachineId, coinTypeId, routeId)
                VALUES (1, 'A1', 1, 1, 1);",
        )
        .unwrap();
        conn
    }

    // Inserta un registro en la máquina 1 y devuelve su id
    fn insert(
        conn: &Connection,
        date: &str,
        cin: i64,
        cout: i64,
        total: f64,
        baseline: bool,
    ) -> i64 {
        conn.execute(
            "INSERT INTO CounterRecord
                (recordDate, counterIn, counterOut, totalDelivered, isBaseline, machineId)
             VALUES (?1, ?2, ?3, ?4, ?5, 1)",
            params![date, cin, cout, total, baseline as i64],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    // Bug arreglado: un registro normal cuyo SIGUIENTE es un reinicio (baseline de
    // contadores bajos) antes no se podía editar nunca. Ahora sí, porque un
    // baseline corta la cadena y no se comparan contadores contra él.
    #[test]
    fn editar_registro_cuyo_siguiente_es_reinicio_se_permite() {
        let conn = setup_conn();
        insert(&conn, "2026-01-01", 0, 0, 0.0, true); // instalación
        let normal = insert(&conn, "2026-01-15", 1000, 400, 300.0, false); // normal
        insert(&conn, "2026-02-01", 0, 0, 0.0, true); // reinicio (contadores bajos)

        // Cambiar solo el total; los contadores (1000/400) superan al reinicio (0/0)
        let res =
            update_counter_record_impl(&conn, normal, "2026-01-15".into(), 1000, 400, 500.0);
        assert!(res.is_ok(), "debería permitirse: {:?}", res.err());
        assert_eq!(res.unwrap().total_delivered, 500.0);
    }

    // Un reinicio arranca de nuevo: puede tener contadores menores que su anterior.
    #[test]
    fn editar_reinicio_bajando_contadores_respecto_del_anterior_se_permite() {
        let conn = setup_conn();
        insert(&conn, "2026-01-01", 0, 0, 0.0, true); // instalación
        insert(&conn, "2026-01-15", 1000, 400, 300.0, false); // normal (anterior al reinicio)
        let reinicio = insert(&conn, "2026-02-01", 50, 20, 0.0, true); // reinicio

        // Bajar por debajo del anterior (1000/400): permitido
        let res =
            update_counter_record_impl(&conn, reinicio, "2026-02-01".into(), 10, 5, 999.0);
        assert!(res.is_ok(), "debería permitirse: {:?}", res.err());
        let calc = res.unwrap();
        assert!(calc.is_baseline);
        assert_eq!(calc.total_delivered, 0.0); // total forzado a 0
        assert!(calc.in_out.is_none()); // baseline no se liquida
    }

    // Pero un reinicio no puede subir por encima del siguiente registro normal:
    // ese siguiente SÍ se calcula contra el reinicio.
    #[test]
    fn editar_reinicio_por_encima_del_siguiente_normal_se_rechaza() {
        let conn = setup_conn();
        insert(&conn, "2026-01-01", 0, 0, 0.0, true); // instalación
        insert(&conn, "2026-01-15", 1000, 400, 300.0, false); // normal
        let reinicio = insert(&conn, "2026-02-01", 50, 20, 0.0, true); // reinicio
        insert(&conn, "2026-02-15", 200, 80, 250.0, false); // normal posterior al reinicio

        // Subir por encima del siguiente normal (200/80): rechazado
        let res =
            update_counter_record_impl(&conn, reinicio, "2026-02-01".into(), 500, 300, 0.0);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("no pueden ser mayores"));
    }

    // Borrar un reinicio con registros posteriores dejaría a esos calculando
    // contra otro ciclo: se rechaza.
    #[test]
    fn eliminar_reinicio_con_registros_posteriores_se_rechaza() {
        let conn = setup_conn();
        insert(&conn, "2026-01-01", 0, 0, 0.0, true); // instalación
        insert(&conn, "2026-01-15", 1000, 400, 300.0, false); // normal
        let reinicio = insert(&conn, "2026-02-01", 0, 0, 0.0, true); // reinicio
        insert(&conn, "2026-02-15", 200, 80, 250.0, false); // posterior

        let res = delete_counter_record_impl(&conn, reinicio);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("registros posteriores"));
    }

    // Un reinicio que es el último registro sí se puede borrar.
    #[test]
    fn eliminar_reinicio_sin_posteriores_se_permite() {
        let conn = setup_conn();
        insert(&conn, "2026-01-01", 0, 0, 0.0, true);
        insert(&conn, "2026-01-15", 1000, 400, 300.0, false);
        let reinicio = insert(&conn, "2026-02-01", 0, 0, 0.0, true);

        assert!(delete_counter_record_impl(&conn, reinicio).is_ok());
    }

    // La instalación (baseline más antiguo) nunca se borra.
    #[test]
    fn eliminar_instalacion_se_rechaza() {
        let conn = setup_conn();
        let install = insert(&conn, "2026-01-01", 0, 0, 0.0, true);
        insert(&conn, "2026-01-15", 1000, 400, 300.0, false);

        let res = delete_counter_record_impl(&conn, install);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("instalación"));
    }
}
