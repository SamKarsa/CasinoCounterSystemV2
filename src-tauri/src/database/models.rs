use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub user_id: i64,
    pub user_name: String,
    pub user_status: bool,
    pub role_id: i64,
    pub role_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Route {
    pub route_id: i64,
    pub route_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Machine {
    pub machine_id: i64,
    pub number_machine: String,
    pub type_machine_id: i64,
    pub type_machine_name: Option<String>,
    pub coin_type_id: i64,
    pub num_coin: Option<i32>,
    pub route_id: i64,
    pub route_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterRecord {
    pub counter_record_id: i64,
    pub record_date: String,
    pub counter_in: i64,
    pub counter_out: i64,
    pub total_delivered: f64,
    pub machine_id: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeMachine {
    pub type_machine_id: i64,
    pub name_type_machine: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoinType {
    pub coin_type_id: i64,
    pub num_coin: i32,
}