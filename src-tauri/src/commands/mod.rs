use tauri::State;
use rusqlite::Connection;
use std::cmp::Ordering;
use std::sync::Mutex;

pub mod auth;
pub mod machines;
pub mod records;
pub mod routes;
pub mod users;

// Estado global para compartir la conexión a la BD
pub struct DbConnection(pub Mutex<Connection>);

// Primer segmento de s: una tirada de dígitos o una de no-dígitos.
// Devuelve (segmento, es_dígito, resto).
fn split_segment(s: &str) -> (&str, bool, &str) {
    let is_digit = s.chars().next().is_some_and(|c| c.is_ascii_digit());
    let end = s
        .char_indices()
        .find(|(_, c)| c.is_ascii_digit() != is_digit)
        .map(|(i, _)| i)
        .unwrap_or(s.len());
    (&s[..end], is_digit, &s[end..])
}

// Compara dos tiradas de dígitos como números, sin parsearlas: primero por
// cantidad de dígitos significativos y después lexicográficamente. Así no hay
// overflow por más larga que sea la tirada.
// A igual valor ("7" y "007"), va primero el que tiene menos ceros a la izquierda.
fn cmp_digits(a: &str, b: &str) -> Ordering {
    let sig_a = a.trim_start_matches('0');
    let sig_b = b.trim_start_matches('0');
    sig_a
        .len()
        .cmp(&sig_b.len())
        .then_with(|| sig_a.cmp(sig_b))
        .then_with(|| a.len().cmp(&b.len()))
}

// Orden natural: "A2" < "A10" < "A100" en vez del orden de texto puro, que
// pone "A100" antes que "A11". Los tramos de dígitos se comparan como números
// y el resto como texto sin distinguir mayúsculas.
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let (mut rest_a, mut rest_b) = (a, b);

    while !rest_a.is_empty() && !rest_b.is_empty() {
        let (seg_a, digits_a, next_a) = split_segment(rest_a);
        let (seg_b, digits_b, next_b) = split_segment(rest_b);

        let ord = if digits_a && digits_b {
            cmp_digits(seg_a, seg_b)
        } else {
            seg_a.to_lowercase().cmp(&seg_b.to_lowercase())
        };

        if ord != Ordering::Equal {
            return ord;
        }

        rest_a = next_a;
        rest_b = next_b;
    }

    match (rest_a.is_empty(), rest_b.is_empty()) {
        // Iguales salvo mayúsculas o ceros a la izquierda: desempate estable
        (true, true) => a.cmp(b),
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        (false, false) => unreachable!("el bucle solo sale con alguno vacío"),
    }
}

#[cfg(test)]
mod tests {
    use super::natural_cmp;
    use std::cmp::Ordering;

    #[test]
    fn ordena_los_numeros_como_numeros() {
        assert_eq!(natural_cmp("A2", "A10"), Ordering::Less);
        assert_eq!(natural_cmp("A10", "A100"), Ordering::Less);
        assert_eq!(natural_cmp("A100", "A11"), Ordering::Greater);
    }

    #[test]
    fn el_prefijo_manda_sobre_el_numero() {
        assert_eq!(natural_cmp("B1", "A100"), Ordering::Greater);
    }

    #[test]
    fn ignora_mayusculas_en_el_texto() {
        assert_eq!(natural_cmp("a2", "A10"), Ordering::Less);
        assert_eq!(natural_cmp("a10", "A2"), Ordering::Greater);
    }

    #[test]
    fn tolera_ceros_a_la_izquierda_y_tiradas_enormes() {
        assert_eq!(natural_cmp("A007", "A7"), Ordering::Greater); // desempate estable
        assert_eq!(natural_cmp("A007", "A8"), Ordering::Less);
        // Más largo que un u64: no hay parseo, no hay overflow
        assert_eq!(
            natural_cmp("A99999999999999999999999", "A100000000000000000000000"),
            Ordering::Less
        );
    }

    #[test]
    fn ordena_una_lista_completa() {
        let mut v = vec!["A100", "B1", "A2", "A11", "A10"];
        v.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(v, vec!["A2", "A10", "A11", "A100", "B1"]);
    }
}
