use crate::model::{ModelAsset, PartSnapshot, SymbolAsset};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rusqlite::{params, Connection};
use serde_json::Value;
use std::path::Path;

const DEFAULT_PARTS_JSON: &str = include_str!("default_parts.json");
const DEFAULT_MX150_PARTS_JSON: &str = include_str!("default_mx150_parts.json");
const DEFAULT_JST_HIROSE_PARTS_JSON: &str = include_str!("default_jst_hirose_parts.json");

const DEFAULT_MODEL_ASSETS: &[(&str, &str, &str, &[u8])] = &[
    (
        "builtin-model-hirose-df13-4s-125c",
        "DF13-4S-1.25C",
        "DF13-4S-1.25C.stp",
        include_bytes!("../assets/parts/hirose/DF13-4S-1.25C.stp"),
    ),
    (
        "builtin-model-hirose-df62c-4s-22c",
        "DF62C-4S-2.2C",
        "DF62C-4S-2.2C.stp",
        include_bytes!("../assets/parts/hirose/DF62C-4S-2.2C.stp"),
    ),
    (
        "builtin-model-hirose-df11-6ds-2c",
        "DF11-6DS-2C",
        "DF11-6DS-2C.stp",
        include_bytes!("../assets/parts/hirose/DF11-6DS-2C.stp"),
    ),
    (
        "builtin-model-hirose-gt17h-4s-2c",
        "GT17H-4S-2C",
        "GT17HS2-4S-ASSY.stp",
        include_bytes!("../assets/parts/hirose/GT17HS2-4S-ASSY.stp"),
    ),
    (
        "builtin-model-molex-334720601",
        "334720601",
        "334720601.stp",
        include_bytes!("../assets/parts/molex/334720601.stp"),
    ),
    (
        "builtin-model-molex-334721201",
        "334721201",
        "334721201.stp",
        include_bytes!("../assets/parts/molex/334721201.stp"),
    ),
    (
        "builtin-model-molex-334721601",
        "334721601",
        "334721601.stp",
        include_bytes!("../assets/parts/molex/334721601.stp"),
    ),
    (
        "builtin-model-molex-334822101",
        "334822101",
        "334822101.stp",
        include_bytes!("../assets/parts/molex/334822101.stp"),
    ),
    (
        "builtin-model-molex-334823601",
        "334823601",
        "334823601.stp",
        include_bytes!("../assets/parts/molex/334823601.stp"),
    ),
    (
        "builtin-model-molex-334824801",
        "334824801",
        "334824801.stp",
        include_bytes!("../assets/parts/molex/334824801.stp"),
    ),
    (
        "builtin-model-molex-334826201",
        "334826201",
        "334826201.stp",
        include_bytes!("../assets/parts/molex/334826201.stp"),
    ),
    (
        "builtin-model-molex-334828601",
        "334828601",
        "334828601.stp",
        include_bytes!("../assets/parts/molex/334828601.stp"),
    ),
    (
        "builtin-model-molex-349500610",
        "349500610",
        "349500610.stp",
        include_bytes!("../assets/parts/molex/349500610.stp"),
    ),
    (
        "builtin-model-molex-349500620",
        "349500620",
        "349500620.stp",
        include_bytes!("../assets/parts/molex/349500620.stp"),
    ),
    (
        "builtin-model-molex-349500811",
        "349500811",
        "349500811.stp",
        include_bytes!("../assets/parts/molex/349500811.stp"),
    ),
    (
        "builtin-model-molex-349500821",
        "349500821",
        "349500821.stp",
        include_bytes!("../assets/parts/molex/349500821.stp"),
    ),
    (
        "builtin-model-molex-349501210",
        "349501210",
        "349501210.stp",
        include_bytes!("../assets/parts/molex/349501210.stp"),
    ),
    (
        "builtin-model-molex-349501220",
        "349501220",
        "349501220.stp",
        include_bytes!("../assets/parts/molex/349501220.stp"),
    ),
    (
        "builtin-model-molex-349501611",
        "349501611",
        "349501611.stp",
        include_bytes!("../assets/parts/molex/349501611.stp"),
    ),
    (
        "builtin-model-molex-349501621",
        "349501621",
        "349501621.stp",
        include_bytes!("../assets/parts/molex/349501621.stp"),
    ),
    (
        "builtin-model-molex-349502011",
        "349502011",
        "349502011.stp",
        include_bytes!("../assets/parts/molex/349502011.stp"),
    ),
    (
        "builtin-model-molex-349502021",
        "349502021",
        "349502021.stp",
        include_bytes!("../assets/parts/molex/349502021.stp"),
    ),
    (
        "builtin-model-molex-349510610",
        "349510610",
        "349510610.stp",
        include_bytes!("../assets/parts/molex/349510610.stp"),
    ),
    (
        "builtin-model-molex-349510620",
        "349510620",
        "349510620.stp",
        include_bytes!("../assets/parts/molex/349510620.stp"),
    ),
    (
        "builtin-model-molex-349510811",
        "349510811",
        "349510811.stp",
        include_bytes!("../assets/parts/molex/349510811.stp"),
    ),
    (
        "builtin-model-molex-349510821",
        "349510821",
        "349510821.stp",
        include_bytes!("../assets/parts/molex/349510821.stp"),
    ),
    (
        "builtin-model-molex-349510831",
        "349510831",
        "349510831.stp",
        include_bytes!("../assets/parts/molex/349510831.stp"),
    ),
    (
        "builtin-model-molex-349510841",
        "349510841",
        "349510841.stp",
        include_bytes!("../assets/parts/molex/349510841.stp"),
    ),
    (
        "builtin-model-molex-349511210",
        "349511210",
        "349511210.stp",
        include_bytes!("../assets/parts/molex/349511210.stp"),
    ),
    (
        "builtin-model-molex-349511220",
        "349511220",
        "349511220.stp",
        include_bytes!("../assets/parts/molex/349511220.stp"),
    ),
    (
        "builtin-model-molex-349511611",
        "349511611",
        "349511611.stp",
        include_bytes!("../assets/parts/molex/349511611.stp"),
    ),
    (
        "builtin-model-molex-349511621",
        "349511621",
        "349511621.stp",
        include_bytes!("../assets/parts/molex/349511621.stp"),
    ),
    (
        "builtin-model-molex-349511631",
        "349511631",
        "349511631.stp",
        include_bytes!("../assets/parts/molex/349511631.stp"),
    ),
    (
        "builtin-model-molex-349511641",
        "349511641",
        "349511641.stp",
        include_bytes!("../assets/parts/molex/349511641.stp"),
    ),
    (
        "builtin-model-molex-349512011",
        "349512011",
        "349512011.stp",
        include_bytes!("../assets/parts/molex/349512011.stp"),
    ),
    (
        "builtin-model-molex-349512021",
        "349512021",
        "349512021.stp",
        include_bytes!("../assets/parts/molex/349512021.stp"),
    ),
    (
        "builtin-model-molex-430250200",
        "430250200",
        "430250200.stp",
        include_bytes!("../assets/parts/molex/430250200.stp"),
    ),
    (
        "builtin-model-molex-430250400",
        "430250400",
        "430250400.stp",
        include_bytes!("../assets/parts/molex/430250400.stp"),
    ),
    (
        "builtin-model-molex-430250600",
        "430250600",
        "430250600.stp",
        include_bytes!("../assets/parts/molex/430250600.stp"),
    ),
    (
        "builtin-model-molex-430250800",
        "430250800",
        "430250800.stp",
        include_bytes!("../assets/parts/molex/430250800.stp"),
    ),
    (
        "builtin-model-molex-430251000",
        "430251000",
        "430251000.stp",
        include_bytes!("../assets/parts/molex/430251000.stp"),
    ),
    (
        "builtin-model-molex-430251200",
        "430251200",
        "430251200.stp",
        include_bytes!("../assets/parts/molex/430251200.stp"),
    ),
    (
        "builtin-model-molex-430251400",
        "430251400",
        "430251400.stp",
        include_bytes!("../assets/parts/molex/430251400.stp"),
    ),
    (
        "builtin-model-molex-430251600",
        "430251600",
        "430251600.stp",
        include_bytes!("../assets/parts/molex/430251600.stp"),
    ),
    (
        "builtin-model-molex-430251800",
        "430251800",
        "430251800.stp",
        include_bytes!("../assets/parts/molex/430251800.stp"),
    ),
    (
        "builtin-model-molex-430252000",
        "430252000",
        "430252000.stp",
        include_bytes!("../assets/parts/molex/430252000.stp"),
    ),
    (
        "builtin-model-molex-430252200",
        "430252200",
        "430252200.stp",
        include_bytes!("../assets/parts/molex/430252200.stp"),
    ),
    (
        "builtin-model-molex-430252400",
        "430252400",
        "430252400.stp",
        include_bytes!("../assets/parts/molex/430252400.stp"),
    ),
    (
        "builtin-model-molex-510210200",
        "510210200",
        "510210200.stp",
        include_bytes!("../assets/parts/molex/510210200.stp"),
    ),
    (
        "builtin-model-molex-510210300",
        "510210300",
        "510210300.stp",
        include_bytes!("../assets/parts/molex/510210300.stp"),
    ),
    (
        "builtin-model-molex-510210400",
        "510210400",
        "510210400.stp",
        include_bytes!("../assets/parts/molex/510210400.stp"),
    ),
    (
        "builtin-model-molex-510210500",
        "510210500",
        "510210500.stp",
        include_bytes!("../assets/parts/molex/510210500.stp"),
    ),
    (
        "builtin-model-molex-510210600",
        "510210600",
        "510210600.stp",
        include_bytes!("../assets/parts/molex/510210600.stp"),
    ),
    (
        "builtin-model-molex-510210700",
        "510210700",
        "510210700.stp",
        include_bytes!("../assets/parts/molex/510210700.stp"),
    ),
    (
        "builtin-model-molex-510210800",
        "510210800",
        "510210800.stp",
        include_bytes!("../assets/parts/molex/510210800.stp"),
    ),
    (
        "builtin-model-molex-510210900",
        "510210900",
        "510210900.stp",
        include_bytes!("../assets/parts/molex/510210900.stp"),
    ),
    (
        "builtin-model-molex-510211000",
        "510211000",
        "510211000.stp",
        include_bytes!("../assets/parts/molex/510211000.stp"),
    ),
    (
        "builtin-model-molex-510211100",
        "510211100",
        "510211100.stp",
        include_bytes!("../assets/parts/molex/510211100.stp"),
    ),
    (
        "builtin-model-molex-510211200",
        "510211200",
        "510211200.stp",
        include_bytes!("../assets/parts/molex/510211200.stp"),
    ),
    (
        "builtin-model-molex-510211300",
        "510211300",
        "510211300.stp",
        include_bytes!("../assets/parts/molex/510211300.stp"),
    ),
    (
        "builtin-model-molex-510211400",
        "510211400",
        "510211400.stp",
        include_bytes!("../assets/parts/molex/510211400.stp"),
    ),
    (
        "builtin-model-molex-510211500",
        "510211500",
        "510211500.stp",
        include_bytes!("../assets/parts/molex/510211500.stp"),
    ),
];

fn default_parts() -> Result<Vec<PartSnapshot>, String> {
    let mut parts: Vec<PartSnapshot> =
        serde_json::from_str(DEFAULT_PARTS_JSON).map_err(|error| error.to_string())?;
    parts.extend(
        serde_json::from_str::<Vec<PartSnapshot>>(DEFAULT_MX150_PARTS_JSON)
            .map_err(|error| error.to_string())?,
    );
    parts.extend(
        serde_json::from_str::<Vec<PartSnapshot>>(DEFAULT_JST_HIROSE_PARTS_JSON)
            .map_err(|error| error.to_string())?,
    );
    Ok(parts)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryIntegrity {
    pub ok: bool,
    pub message: String,
    pub part_count: usize,
    pub backup_count: usize,
}

pub fn initialize(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection.execute_batch("CREATE TABLE IF NOT EXISTS parts (id TEXT PRIMARY KEY, part_number TEXT NOT NULL, category TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS model_assets (id TEXT PRIMARY KEY, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS symbol_assets (id TEXT PRIMARY KEY, json TEXT NOT NULL);").map_err(|error| error.to_string())
}

pub fn create_rotating_backup(path: &Path, retention: usize) -> Result<(), String> {
    if retention == 0 || !path.exists() {
        return Ok(());
    }
    let directory = path
        .parent()
        .unwrap_or(Path::new("."))
        .join("library-backups");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::fs::copy(path, directory.join(format!("parts-{nanos}.db")))
        .map_err(|error| format!("라이브러리 자동 백업에 실패했습니다: {error}"))?;
    let mut backups = std::fs::read_dir(&directory)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .path()
                .extension()
                .is_some_and(|extension| extension == "db")
        })
        .collect::<Vec<_>>();
    backups.sort_by_key(|entry| entry.file_name());
    let remove_count = backups.len().saturating_sub(retention);
    for entry in backups.into_iter().take(remove_count) {
        std::fs::remove_file(entry.path()).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn check_integrity(path: &Path) -> Result<LibraryIntegrity, String> {
    initialize(path)?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let result: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    let part_count: usize = connection
        .query_row("SELECT COUNT(*) FROM parts", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    let backup_count = path
        .parent()
        .unwrap_or(Path::new("."))
        .join("library-backups")
        .read_dir()
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter(|entry| {
                    entry
                        .path()
                        .extension()
                        .is_some_and(|extension| extension == "db")
                })
                .count()
        })
        .unwrap_or(0);
    Ok(LibraryIntegrity {
        ok: result == "ok",
        message: result,
        part_count,
        backup_count,
    })
}

pub fn list(path: &Path) -> Result<Vec<PartSnapshot>, String> {
    initialize(path)?;
    seed_default_parts(path)?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare("SELECT json FROM parts ORDER BY category, part_number")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.map(|row| {
        row.map_err(|error| error.to_string())
            .and_then(|json| serde_json::from_str(&json).map_err(|error| error.to_string()))
    })
    .collect()
}

pub fn seed_default_parts(path: &Path) -> Result<usize, String> {
    let parts = default_parts()?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    seed_default_model_assets(&connection)?;
    let mut changed = 0;
    for part in parts {
        let mut value = serde_json::to_value(&part).map_err(|error| error.to_string())?;
        sort_json_keys(&mut value);
        let json = serde_json::to_string(&value).map_err(|error| error.to_string())?;
        changed += connection.execute(
            "INSERT INTO parts (id, part_number, category, revision, json) VALUES (?1, ?2, ?3, 1, ?4) ON CONFLICT(id) DO UPDATE SET part_number=excluded.part_number, category=excluded.category, revision=parts.revision+1, json=excluded.json WHERE parts.id LIKE 'builtin-%' AND parts.json NOT LIKE '%\"libraryUserOverride\":\"true\"%' AND parts.json <> excluded.json",
            params![part.id, part.part_number, part.category, json],
        ).map_err(|error| error.to_string())?;
    }
    Ok(changed)
}

fn seed_default_model_assets(connection: &Connection) -> Result<(), String> {
    for (id, name, source_name, bytes) in DEFAULT_MODEL_ASSETS {
        let asset = ModelAsset {
            id: (*id).into(),
            name: (*name).into(),
            source_format: "step".into(),
            source_name: (*source_name).into(),
            source_data_base64: BASE64.encode(bytes),
            meshes: Vec::new(),
        };
        let json = serde_json::to_string(&asset).map_err(|error| error.to_string())?;
        connection
            .execute(
                "INSERT OR IGNORE INTO model_assets (id, json) VALUES (?1, ?2)",
                params![asset.id, json],
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn sort_json_keys(value: &mut Value) {
    match value {
        Value::Object(map) => {
            let mut entries = std::mem::take(map).into_iter().collect::<Vec<_>>();
            entries.sort_by(|left, right| left.0.cmp(&right.0));
            for (key, mut item) in entries {
                sort_json_keys(&mut item);
                map.insert(key, item);
            }
        }
        Value::Array(items) => items.iter_mut().for_each(sort_json_keys),
        _ => {}
    }
}

pub fn upsert(path: &Path, part: &PartSnapshot) -> Result<(), String> {
    initialize(path)?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let mut stored_part = part.clone();
    if stored_part.id.starts_with("builtin-") {
        stored_part
            .attributes
            .insert("libraryUserOverride".into(), "true".into());
    }
    let json = serde_json::to_string(&stored_part).map_err(|error| error.to_string())?;
    connection.execute("INSERT INTO parts (id, part_number, category, revision, json) VALUES (?1, ?2, ?3, 1, ?4) ON CONFLICT(id) DO UPDATE SET part_number=excluded.part_number, category=excluded.category, revision=parts.revision+1, json=excluded.json", params![stored_part.id, stored_part.part_number, stored_part.category, json]).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn get_model_asset(path: &Path, id: &str) -> Result<Option<ModelAsset>, String> {
    initialize(path)?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let result = connection.query_row("SELECT json FROM model_assets WHERE id = ?1", [id], |row| {
        row.get::<_, String>(0)
    });
    match result {
        Ok(json) => serde_json::from_str(&json)
            .map(Some)
            .map_err(|error| error.to_string()),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub fn upsert_model_asset(path: &Path, asset: &ModelAsset) -> Result<(), String> {
    initialize(path)?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let json = serde_json::to_string(asset).map_err(|error| error.to_string())?;
    connection.execute("INSERT INTO model_assets (id, json) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET json=excluded.json", params![asset.id, json]).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn get_symbol_asset(path: &Path, id: &str) -> Result<Option<SymbolAsset>, String> {
    initialize(path)?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let result = connection.query_row(
        "SELECT json FROM symbol_assets WHERE id = ?1",
        [id],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(json) => serde_json::from_str(&json)
            .map(Some)
            .map_err(|error| error.to_string()),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub fn upsert_symbol_asset(path: &Path, asset: &SymbolAsset) -> Result<(), String> {
    initialize(path)?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let json = serde_json::to_string(asset).map_err(|error| error.to_string())?;
    connection.execute("INSERT INTO symbol_assets (id, json) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET json=excluded.json", params![asset.id, json]).map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ModelAsset, ModelMesh};
    use std::collections::HashSet;

    #[test]
    fn model_asset_round_trip_preserves_step_and_mesh() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("library.sqlite");
        let asset = ModelAsset {
            id: "model-1".into(),
            name: "Housing 3D".into(),
            source_format: "step".into(),
            source_name: "housing.step".into(),
            source_data_base64: "SVNPLTEwMzAzLTIxOw==".into(),
            meshes: vec![ModelMesh {
                name: "body".into(),
                color: Some([0.2, 0.4, 0.6]),
                positions: vec![0.0, 0.0, 0.0],
                normals: None,
                indices: vec![],
            }],
        };

        upsert_model_asset(&path, &asset).unwrap();
        let loaded = get_model_asset(&path, &asset.id).unwrap().unwrap();

        assert_eq!(loaded.source_name, "housing.step");
        assert_eq!(loaded.source_data_base64, asset.source_data_base64);
        assert_eq!(loaded.meshes[0].name, "body");
        assert_eq!(loaded.meshes[0].color, Some([0.2, 0.4, 0.6]));
    }

    #[test]
    fn symbol_asset_round_trip_preserves_svg() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("library.sqlite");
        let asset = SymbolAsset {
            id: "symbol-1".into(),
            name: "Housing drawing".into(),
            source_format: "svg".into(),
            source_name: "housing.svg".into(),
            view_box: "0 0 10 10".into(),
            svg: "<svg viewBox=\"0 0 10 10\"></svg>".into(),
        };

        upsert_symbol_asset(&path, &asset).unwrap();
        let loaded = get_symbol_asset(&path, &asset.id).unwrap().unwrap();

        assert_eq!(loaded.source_name, asset.source_name);
        assert_eq!(loaded.svg, asset.svg);
    }

    #[test]
    fn rotating_backup_keeps_requested_count_and_integrity_is_ok() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("parts.db");
        initialize(&path).unwrap();
        for _ in 0..4 {
            create_rotating_backup(&path, 2).unwrap();
        }
        let result = check_integrity(&path).unwrap();
        assert!(result.ok);
        assert_eq!(result.backup_count, 2);
    }

    #[test]
    fn default_library_covers_every_supported_category_without_overwriting_user_parts() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("parts.db");
        initialize(&path).unwrap();
        assert_eq!(seed_default_parts(&path).unwrap(), 133);
        assert_eq!(seed_default_parts(&path).unwrap(), 0);
        let connection = Connection::open(&path).unwrap();
        connection
            .execute(
                "UPDATE parts SET json = '{}' WHERE id = 'builtin-belden-8723'",
                [],
            )
            .unwrap();
        assert_eq!(seed_default_parts(&path).unwrap(), 1);
        let parts = list(&path).unwrap();
        assert_eq!(parts.len(), 133);
        let categories = parts
            .iter()
            .map(|part| part.category.as_str())
            .collect::<HashSet<_>>();
        assert_eq!(
            categories,
            HashSet::from([
                "housing",
                "terminal",
                "seal",
                "wire",
                "cable",
                "heatShrink",
                "sleeve",
                "shield",
                "tape",
                "label",
                "clip",
                "lug",
                "splice"
            ])
        );

        let ids = parts
            .iter()
            .map(|part| part.id.as_str())
            .collect::<HashSet<_>>();
        assert_eq!(ids.len(), parts.len());
        for housing in parts
            .iter()
            .filter(|part| part.category == "housing" && part.manufacturer == "Molex")
        {
            let compatible_ids: Vec<String> =
                serde_json::from_str(housing.attributes.get("compatibleTerminalPartIds").unwrap())
                    .unwrap();
            assert!(!compatible_ids.is_empty());
            assert!(compatible_ids.iter().all(|id| parts
                .iter()
                .any(|part| part.id == *id && part.category == "terminal")));
        }
        for housing in parts
            .iter()
            .filter(|part| part.attributes.contains_key("compatibleClampPartIds"))
        {
            let compatible_ids: Vec<String> =
                serde_json::from_str(housing.attributes.get("compatibleClampPartIds").unwrap())
                    .unwrap();
            assert!(!compatible_ids.is_empty());
            assert!(compatible_ids
                .iter()
                .all(|id| parts.iter().any(|part| part.id == *id
                    && part.category == "clip"
                    && part.attributes.get("accessoryType").map(String::as_str)
                        == Some("connectorClamp"))));
            for clamp_id in compatible_ids {
                let clamp = parts.iter().find(|part| part.id == clamp_id).unwrap();
                let housing_ids: Vec<String> =
                    serde_json::from_str(clamp.attributes.get("compatibleHousingPartIds").unwrap())
                        .unwrap();
                assert!(housing_ids.contains(&housing.id));
            }
        }

        let mx150_housings = parts
            .iter()
            .filter(|part| {
                part.category == "housing"
                    && part.attributes.get("series").map(String::as_str) == Some("MX150")
            })
            .collect::<Vec<_>>();
        assert_eq!(mx150_housings.len(), 10);
        assert!(mx150_housings
            .iter()
            .all(|part| part.attributes.contains_key("officialImageUrl")
                && part.attributes.contains_key("drawingUrl")
                && part.attributes.contains_key("sourceUrl")));
        assert!(mx150_housings
            .iter()
            .any(|part| part.attributes.contains_key("cadReferenceUrl")));
        assert_eq!(
            parts
                .iter()
                .filter(|part| part.category == "clip"
                    && part.attributes.get("accessoryType").map(String::as_str)
                        == Some("connectorClamp"))
                .count(),
            32
        );

        let molex_pin_counts = parts
            .iter()
            .filter(|part| part.category == "housing" && part.manufacturer == "Molex")
            .map(|part| part.attributes["cavities"].parse::<usize>().unwrap())
            .collect::<HashSet<_>>();
        assert!(HashSet::from([2, 3, 4, 6, 8, 10, 12, 15, 16, 20, 24]).is_subset(&molex_pin_counts));

        let molex_connector_assets = parts
            .iter()
            .filter(|part| {
                part.manufacturer == "Molex"
                    && (part.category == "housing"
                        || part.attributes.get("accessoryType").map(String::as_str)
                            == Some("connectorClamp"))
            })
            .collect::<Vec<_>>();
        assert_eq!(molex_connector_assets.len(), 74);
        assert!(molex_connector_assets.iter().all(|part| part
            .attributes
            .contains_key("officialImageUrl")
            && part.attributes.contains_key("drawingUrl")
            && part.attributes.contains_key("cadReferenceUrl")));
        assert_eq!(
            molex_connector_assets
                .iter()
                .filter(|part| part.model_asset_id.is_some())
                .count(),
            58
        );
        assert!(molex_connector_assets
            .iter()
            .filter_map(|part| part.model_asset_id.as_deref())
            .all(|asset_id| get_model_asset(&path, asset_id).unwrap().is_some()));

        let cable_core_counts = parts
            .iter()
            .filter(|part| part.category == "cable")
            .map(|part| part.attributes["coreCount"].parse::<usize>().unwrap())
            .collect::<HashSet<_>>();
        assert!(
            HashSet::from([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50])
                .is_subset(&cable_core_counts)
        );
        assert!(
            parts
                .iter()
                .any(|part| part.category == "cable"
                    && part.attributes["construction"] == "multiCore")
        );
        assert!(parts.iter().any(|part| part.category == "cable"
            && part.attributes["construction"] == "shieldedMultiCore"));

        for manufacturer in ["JST", "Hirose"] {
            let housings = parts
                .iter()
                .filter(|part| part.category == "housing" && part.manufacturer == manufacturer)
                .collect::<Vec<_>>();
            assert_eq!(housings.len(), 4);
            assert!(housings
                .iter()
                .all(|part| part.attributes.contains_key("officialImageUrl")
                    && part.attributes.contains_key("drawingUrl")
                    && part.attributes.contains_key("cadReferenceUrl")));
            assert!(housings.iter().all(|part| {
                let terminal_ids: Vec<String> =
                    serde_json::from_str(part.attributes.get("compatibleTerminalPartIds").unwrap())
                        .unwrap();
                terminal_ids.iter().all(|id| {
                    parts
                        .iter()
                        .any(|candidate| candidate.id == *id && candidate.category == "terminal")
                })
            }));
        }
        assert!(parts
            .iter()
            .filter(|part| part.category == "housing" && part.manufacturer == "Hirose")
            .all(|part| part.model_asset_id.is_some()));
        for asset_id in DEFAULT_MODEL_ASSETS.iter().map(|item| item.0) {
            let asset = get_model_asset(&path, asset_id).unwrap().unwrap();
            assert_eq!(asset.source_format, "step");
            assert!(!asset.source_data_base64.is_empty());
            assert!(asset.meshes.is_empty());
        }
    }

    #[test]
    fn edited_builtin_part_is_not_overwritten_by_default_seed() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("parts.db");
        initialize(&path).unwrap();
        seed_default_parts(&path).unwrap();

        let mut part = default_parts()
            .unwrap()
            .into_iter()
            .find(|part| part.id == "builtin-belden-8723")
            .unwrap();
        part.name = Some("사용자 수정 케이블".into());
        upsert(&path, &part).unwrap();

        assert_eq!(seed_default_parts(&path).unwrap(), 0);
        let loaded = list(&path)
            .unwrap()
            .into_iter()
            .find(|part| part.id == "builtin-belden-8723")
            .unwrap();
        assert_eq!(loaded.name.as_deref(), Some("사용자 수정 케이블"));
        assert_eq!(
            loaded
                .attributes
                .get("libraryUserOverride")
                .map(String::as_str),
            Some("true")
        );
    }
}
