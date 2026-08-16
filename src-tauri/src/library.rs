use crate::model::{ModelAsset, PartSnapshot, SymbolAsset};
use rusqlite::{params, Connection};
use serde_json::Value;
use std::path::Path;

const DEFAULT_PARTS_JSON: &str = include_str!("default_parts.json");

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryIntegrity {
    pub ok: bool,
    pub message: String,
    pub part_count: usize,
    pub backup_count: usize,
}

pub fn initialize(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection.execute_batch("CREATE TABLE IF NOT EXISTS parts (id TEXT PRIMARY KEY, part_number TEXT NOT NULL, category TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS model_assets (id TEXT PRIMARY KEY, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS symbol_assets (id TEXT PRIMARY KEY, json TEXT NOT NULL);").map_err(|error| error.to_string())
}

pub fn create_rotating_backup(path: &Path, retention: usize) -> Result<(), String> {
    if retention == 0 || !path.exists() { return Ok(()); }
    let directory = path.parent().unwrap_or(Path::new(".")).join("library-backups");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos();
    std::fs::copy(path, directory.join(format!("parts-{nanos}.db"))).map_err(|error| format!("라이브러리 자동 백업에 실패했습니다: {error}"))?;
    let mut backups = std::fs::read_dir(&directory).map_err(|error| error.to_string())?.filter_map(Result::ok)
        .filter(|entry| entry.path().extension().is_some_and(|extension| extension == "db")).collect::<Vec<_>>();
    backups.sort_by_key(|entry| entry.file_name());
    let remove_count = backups.len().saturating_sub(retention);
    for entry in backups.into_iter().take(remove_count) { std::fs::remove_file(entry.path()).map_err(|error| error.to_string())?; }
    Ok(())
}

pub fn check_integrity(path: &Path) -> Result<LibraryIntegrity, String> {
    initialize(path)?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let result: String = connection.query_row("PRAGMA quick_check", [], |row| row.get(0)).map_err(|error| error.to_string())?;
    let part_count: usize = connection.query_row("SELECT COUNT(*) FROM parts", [], |row| row.get(0)).map_err(|error| error.to_string())?;
    let backup_count = path.parent().unwrap_or(Path::new(".")).join("library-backups").read_dir().map(|entries| entries.filter_map(Result::ok).filter(|entry| entry.path().extension().is_some_and(|extension| extension == "db")).count()).unwrap_or(0);
    Ok(LibraryIntegrity { ok: result == "ok", message: result, part_count, backup_count })
}

pub fn list(path: &Path) -> Result<Vec<PartSnapshot>, String> {
    initialize(path)?;
    seed_default_parts(path)?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let mut statement = connection.prepare("SELECT json FROM parts ORDER BY category, part_number").map_err(|error| error.to_string())?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0)).map_err(|error| error.to_string())?;
    rows.map(|row| row.map_err(|error| error.to_string()).and_then(|json| serde_json::from_str(&json).map_err(|error| error.to_string()))).collect()
}

pub fn seed_default_parts(path: &Path) -> Result<usize, String> {
    let parts: Vec<PartSnapshot> = serde_json::from_str(DEFAULT_PARTS_JSON).map_err(|error| error.to_string())?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let mut changed = 0;
    for part in parts {
        let mut value = serde_json::to_value(&part).map_err(|error| error.to_string())?;
        sort_json_keys(&mut value);
        let json = serde_json::to_string(&value).map_err(|error| error.to_string())?;
        changed += connection.execute(
            "INSERT INTO parts (id, part_number, category, revision, json) VALUES (?1, ?2, ?3, 1, ?4) ON CONFLICT(id) DO UPDATE SET part_number=excluded.part_number, category=excluded.category, revision=parts.revision+1, json=excluded.json WHERE parts.id LIKE 'builtin-%' AND parts.json <> excluded.json",
            params![part.id, part.part_number, part.category, json],
        ).map_err(|error| error.to_string())?;
    }
    Ok(changed)
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
    let json = serde_json::to_string(part).map_err(|error| error.to_string())?;
    connection.execute("INSERT INTO parts (id, part_number, category, revision, json) VALUES (?1, ?2, ?3, 1, ?4) ON CONFLICT(id) DO UPDATE SET part_number=excluded.part_number, category=excluded.category, revision=parts.revision+1, json=excluded.json", params![part.id, part.part_number, part.category, json]).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn get_model_asset(path: &Path, id: &str) -> Result<Option<ModelAsset>, String> {
    initialize(path)?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let result = connection.query_row("SELECT json FROM model_assets WHERE id = ?1", [id], |row| row.get::<_, String>(0));
    match result {
        Ok(json) => serde_json::from_str(&json).map(Some).map_err(|error| error.to_string()),
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
    let result = connection.query_row("SELECT json FROM symbol_assets WHERE id = ?1", [id], |row| row.get::<_, String>(0));
    match result {
        Ok(json) => serde_json::from_str(&json).map(Some).map_err(|error| error.to_string()),
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
        assert_eq!(seed_default_parts(&path).unwrap(), 66);
        assert_eq!(seed_default_parts(&path).unwrap(), 0);
        let connection = Connection::open(&path).unwrap();
        connection.execute("UPDATE parts SET json = '{}' WHERE id = 'builtin-belden-8723'", []).unwrap();
        assert_eq!(seed_default_parts(&path).unwrap(), 1);
        let parts = list(&path).unwrap();
        assert_eq!(parts.len(), 66);
        let categories = parts.iter().map(|part| part.category.as_str()).collect::<HashSet<_>>();
        assert_eq!(categories, HashSet::from(["housing", "terminal", "seal", "wire", "cable", "heatShrink", "sleeve", "shield", "tape", "label", "clip", "lug", "splice"]));

        let ids = parts.iter().map(|part| part.id.as_str()).collect::<HashSet<_>>();
        assert_eq!(ids.len(), parts.len());
        for housing in parts.iter().filter(|part| part.category == "housing" && part.manufacturer == "Molex") {
            let compatible_ids: Vec<String> = serde_json::from_str(housing.attributes.get("compatibleTerminalPartIds").unwrap()).unwrap();
            assert!(!compatible_ids.is_empty());
            assert!(compatible_ids.iter().all(|id| parts.iter().any(|part| part.id == *id && part.category == "terminal")));
        }

        let molex_pin_counts = parts.iter().filter(|part| part.category == "housing" && part.manufacturer == "Molex")
            .map(|part| part.attributes["cavities"].parse::<usize>().unwrap()).collect::<HashSet<_>>();
        assert!(HashSet::from([2, 3, 4, 6, 8, 10, 12, 15, 16, 20, 24]).is_subset(&molex_pin_counts));

        let cable_core_counts = parts.iter().filter(|part| part.category == "cable")
            .map(|part| part.attributes["coreCount"].parse::<usize>().unwrap()).collect::<HashSet<_>>();
        assert!(HashSet::from([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50]).is_subset(&cable_core_counts));
        assert!(parts.iter().any(|part| part.category == "cable" && part.attributes["construction"] == "multiCore"));
        assert!(parts.iter().any(|part| part.category == "cable" && part.attributes["construction"] == "shieldedMultiCore"));
    }
}
