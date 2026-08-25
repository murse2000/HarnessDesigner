use crate::model::{ModelAsset, PartSnapshot, SymbolAsset};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

const DEFAULT_PARTS_JSON: &str = include_str!("default_parts.json");
const DEFAULT_MX150_PARTS_JSON: &str = include_str!("default_mx150_parts.json");
const DEFAULT_JST_HIROSE_PARTS_JSON: &str = include_str!("default_jst_hirose_parts.json");
const LEGACY_SAMPLE_PARTS: &[(&str, &str)] = &[
    ("part-housing-4", "builtin-molex-51021-0400"),
    ("part-housing-8", "builtin-molex-33482-4801"),
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

fn builtin_model_relative_path(asset_id: &str) -> Option<PathBuf> {
    if let Some(part_number) = asset_id.strip_prefix("builtin-model-molex-") {
        return Some(PathBuf::from("molex").join(format!("{part_number}.stp")));
    }
    let file_name = match asset_id {
        "builtin-model-hirose-df13-4s-125c" => "DF13-4S-1.25C.stp",
        "builtin-model-hirose-df62c-4s-22c" => "DF62C-4S-2.2C.stp",
        "builtin-model-hirose-df11-6ds-2c" => "DF11-6DS-2C.stp",
        "builtin-model-hirose-gt17h-4s-2c" => "GT17HS2-4S-ASSY.stp",
        _ => return None,
    };
    Some(PathBuf::from("hirose").join(file_name))
}

pub fn seed_builtin_model_assets(path: &Path, resource_root: &Path) -> Result<usize, String> {
    initialize(path)?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let mut changed = 0;
    for part in default_parts()? {
        let Some(asset_id) = part.model_asset_id.as_deref() else {
            continue;
        };
        let exists = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM model_assets WHERE id = ?1)",
                [asset_id],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|error| error.to_string())?;
        if exists {
            continue;
        }
        let Some(relative_path) = builtin_model_relative_path(asset_id) else {
            continue;
        };
        let source = resource_root.join(&relative_path);
        if !source.is_file() {
            continue;
        }
        let source_name = source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "기본 STEP 파일명이 올바르지 않습니다.".to_string())?;
        let asset = ModelAsset {
            id: asset_id.into(),
            name: part.part_number,
            source_format: "step".into(),
            source_name: source_name.into(),
            source_data_base64: BASE64.encode(
                fs::read(&source)
                    .map_err(|error| format!("기본 STEP 파일을 읽을 수 없습니다: {error}"))?,
            ),
            meshes: Vec::new(),
        };
        upsert_model_asset(path, &asset)?;
        changed += 1;
    }
    Ok(changed)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryIntegrity {
    pub ok: bool,
    pub message: String,
    pub part_count: usize,
    pub asset_count: usize,
    pub missing_asset_count: usize,
    pub backup_count: usize,
}

pub fn initialize(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent.join("assets/models")).map_err(|error| error.to_string())?;
        fs::create_dir_all(parent.join("assets/drawings")).map_err(|error| error.to_string())?;
    }
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS library_info (schema_version INTEGER NOT NULL);\
         INSERT INTO library_info (schema_version) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM library_info);\
         CREATE TABLE IF NOT EXISTS parts (id TEXT PRIMARY KEY, part_number TEXT NOT NULL, category TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, json TEXT NOT NULL);\
         CREATE INDEX IF NOT EXISTS parts_category_number ON parts(category, part_number);\
         CREATE TABLE IF NOT EXISTS model_assets (id TEXT PRIMARY KEY, name TEXT NOT NULL, source_format TEXT NOT NULL, source_name TEXT NOT NULL, source_path TEXT NOT NULL, mesh_path TEXT NOT NULL);\
         CREATE TABLE IF NOT EXISTS symbol_assets (id TEXT PRIMARY KEY, name TEXT NOT NULL, source_format TEXT NOT NULL, source_name TEXT NOT NULL, view_box TEXT NOT NULL, source_path TEXT NOT NULL);",
    ).map_err(|error| error.to_string())
}

pub fn create_rotating_backup(path: &Path, retention: usize) -> Result<(), String> {
    if retention == 0 || !path.exists() {
        return Ok(());
    }
    let directory = path
        .parent()
        .unwrap_or(Path::new("."))
        .join("library-backups");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    fs::copy(path, directory.join(format!("library-{nanos}.db")))
        .map_err(|error| format!("라이브러리 자동 백업에 실패했습니다: {error}"))?;
    let mut backups = fs::read_dir(&directory)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter(is_library_backup)
        .collect::<Vec<_>>();
    backups.sort_by_key(|entry| entry.file_name());
    let remove_count = backups.len().saturating_sub(retention);
    for entry in backups.into_iter().take(remove_count) {
        fs::remove_file(entry.path()).map_err(|error| error.to_string())?;
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
    let model_paths = query_asset_paths(
        &connection,
        "SELECT source_path, mesh_path FROM model_assets",
    )?;
    let symbol_paths = query_asset_paths(&connection, "SELECT source_path, '' FROM symbol_assets")?;
    let asset_count = model_paths.len() * 2 + symbol_paths.len();
    let directory = library_directory(path);
    let missing_asset_count = model_paths
        .into_iter()
        .flat_map(|(source, secondary)| [source, secondary])
        .chain(symbol_paths.into_iter().map(|(source, _)| source))
        .filter(|relative| !relative.is_empty() && !directory.join(relative).is_file())
        .count();
    let backup_count = path
        .parent()
        .unwrap_or(Path::new("."))
        .join("library-backups")
        .read_dir()
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter(is_library_backup)
                .count()
        })
        .unwrap_or(0);
    Ok(LibraryIntegrity {
        ok: result == "ok" && missing_asset_count == 0,
        message: if missing_asset_count == 0 {
            result
        } else {
            format!("누락된 외부 자산 {missing_asset_count}개")
        },
        part_count,
        asset_count,
        missing_asset_count,
        backup_count,
    })
}

fn is_library_backup(entry: &fs::DirEntry) -> bool {
    entry.file_name().to_string_lossy().starts_with("library-")
        && entry
            .path()
            .extension()
            .is_some_and(|extension| extension == "db")
}

fn query_asset_paths(connection: &Connection, sql: &str) -> Result<Vec<(String, String)>, String> {
    let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn list(path: &Path) -> Result<Vec<PartSnapshot>, String> {
    initialize(path)?;
    seed_default_parts(path)?;
    remove_legacy_sample_parts(path)?;
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

fn remove_legacy_sample_parts(path: &Path) -> Result<usize, String> {
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let mut removed = 0;
    for (legacy_id, canonical_id) in LEGACY_SAMPLE_PARTS {
        let canonical_exists = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM parts WHERE id = ?1)",
                [canonical_id],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|error| error.to_string())?;
        if !canonical_exists {
            continue;
        }
        let legacy_json = connection
            .query_row("SELECT json FROM parts WHERE id = ?1", [legacy_id], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(|error| error.to_string())?;
        let Some(legacy_json) = legacy_json else {
            continue;
        };
        let legacy: PartSnapshot =
            serde_json::from_str(&legacy_json).map_err(|error| error.to_string())?;
        removed += connection
            .execute("DELETE FROM parts WHERE id = ?1", [legacy_id])
            .map_err(|error| error.to_string())?;
        let Some(symbol_id) = legacy.symbol_asset_id else {
            continue;
        };
        let referenced = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM parts WHERE json_extract(json, '$.symbolAssetId') = ?1)",
                [&symbol_id],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|error| error.to_string())?;
        if referenced {
            continue;
        }
        let source_path = connection
            .query_row(
                "SELECT source_path FROM symbol_assets WHERE id = ?1",
                [&symbol_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        connection
            .execute("DELETE FROM symbol_assets WHERE id = ?1", [&symbol_id])
            .map_err(|error| error.to_string())?;
        if let Some(source_path) = source_path {
            let source = library_directory(path).join(source_path);
            if source.is_file() {
                fs::remove_file(source).map_err(|error| error.to_string())?;
            }
        }
    }
    Ok(removed)
}

pub fn seed_default_parts(path: &Path) -> Result<usize, String> {
    let parts = default_parts()?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let mut changed = 0;
    for mut part in parts {
        if part.model_asset_id.as_ref().is_some_and(|asset_id| {
            !connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM model_assets WHERE id = ?1)",
                    [asset_id],
                    |row| row.get::<_, bool>(0),
                )
                .unwrap_or(false)
        }) {
            part.model_asset_id = None;
        }
        if part.symbol_asset_id.as_ref().is_some_and(|asset_id| {
            !connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM symbol_assets WHERE id = ?1)",
                    [asset_id],
                    |row| row.get::<_, bool>(0),
                )
                .unwrap_or(false)
        }) {
            part.symbol_asset_id = None;
        }
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
    let result = connection.query_row(
        "SELECT name, source_format, source_name, source_path, mesh_path FROM model_assets WHERE id = ?1",
        [id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?)),
    );
    match result {
        Ok((name, source_format, source_name, source_path, mesh_path)) => {
            let directory = library_directory(path);
            let source = fs::read(resolve_asset_path(
                directory,
                &source_path,
                "assets/models",
            )?)
            .map_err(|error| format!("3D 원본 파일을 읽을 수 없습니다: {error}"))?;
            let meshes =
                fs::read_to_string(resolve_asset_path(directory, &mesh_path, "assets/models")?)
                    .ok()
                    .map(|json| serde_json::from_str(&json))
                    .transpose()
                    .map_err(|error| format!("3D 메시 파일이 손상되었습니다: {error}"))?
                    .unwrap_or_default();
            Ok(Some(ModelAsset {
                id: id.into(),
                name,
                source_format,
                source_name,
                source_data_base64: BASE64.encode(source),
                meshes,
            }))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub fn upsert_model_asset(path: &Path, asset: &ModelAsset) -> Result<(), String> {
    initialize(path)?;
    let safe_id = safe_asset_name(&asset.id)?;
    let source_path = format!("assets/models/{safe_id}.step");
    let mesh_path = format!("assets/models/{safe_id}.mesh.json");
    let directory = library_directory(path);
    if !asset.source_data_base64.is_empty() {
        let source = BASE64
            .decode(&asset.source_data_base64)
            .map_err(|error| format!("3D 원본 데이터가 손상되었습니다: {error}"))?;
        write_atomic(&directory.join(&source_path), &source)?;
    } else if !directory.join(&source_path).exists() {
        return Err("저장할 STEP 원본 데이터가 없습니다.".into());
    }
    if !asset.meshes.is_empty() || !directory.join(&mesh_path).exists() {
        write_atomic(
            &directory.join(&mesh_path),
            &serde_json::to_vec(&asset.meshes).map_err(|error| error.to_string())?,
        )?;
    }
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection.execute(
        "INSERT INTO model_assets (id, name, source_format, source_name, source_path, mesh_path) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET name=excluded.name, source_format=excluded.source_format, source_name=excluded.source_name, source_path=excluded.source_path, mesh_path=excluded.mesh_path",
        params![asset.id, asset.name, asset.source_format, asset.source_name, source_path, mesh_path],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn get_symbol_asset(path: &Path, id: &str) -> Result<Option<SymbolAsset>, String> {
    initialize(path)?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let result = connection.query_row("SELECT name, source_format, source_name, view_box, source_path FROM symbol_assets WHERE id = ?1", [id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?))
    });
    match result {
        Ok((name, source_format, source_name, view_box, source_path)) => {
            let svg = fs::read_to_string(resolve_asset_path(
                library_directory(path),
                &source_path,
                "assets/drawings",
            )?)
            .map_err(|error| format!("2D 도면 파일을 읽을 수 없습니다: {error}"))?;
            Ok(Some(SymbolAsset {
                id: id.into(),
                name,
                source_format,
                source_name,
                view_box,
                svg,
            }))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub fn upsert_symbol_asset(path: &Path, asset: &SymbolAsset) -> Result<(), String> {
    initialize(path)?;
    let safe_id = safe_asset_name(&asset.id)?;
    let source_path = format!("assets/drawings/{safe_id}.svg");
    write_atomic(
        &library_directory(path).join(&source_path),
        asset.svg.as_bytes(),
    )?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection.execute(
        "INSERT INTO symbol_assets (id, name, source_format, source_name, view_box, source_path) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET name=excluded.name, source_format=excluded.source_format, source_name=excluded.source_name, view_box=excluded.view_box, source_path=excluded.source_path",
        params![asset.id, asset.name, asset.source_format, asset.source_name, asset.view_box, source_path],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

fn library_directory(path: &Path) -> &Path {
    path.parent().unwrap_or(Path::new("."))
}

fn safe_asset_name(id: &str) -> Result<String, String> {
    let safe = id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .collect::<String>();
    if safe.is_empty() {
        Err("자산 ID가 올바르지 않습니다.".into())
    } else {
        Ok(safe)
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temporary = path.with_extension(format!(
        "{}.tmp",
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or("asset")
    ));
    fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    let backup = path.with_extension(format!(
        "{}.backup",
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or("asset")
    ));
    if path.exists() {
        let _ = fs::remove_file(&backup);
        fs::rename(path, &backup).map_err(|error| error.to_string())?;
    }
    if let Err(error) = fs::rename(&temporary, path) {
        if backup.exists() {
            let _ = fs::rename(&backup, path);
        }
        return Err(error.to_string());
    }
    if backup.exists() {
        let _ = fs::remove_file(backup);
    }
    Ok(())
}

fn resolve_asset_path(
    directory: &Path,
    relative: &str,
    expected_root: &str,
) -> Result<PathBuf, String> {
    let relative = Path::new(relative);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
        || !relative.starts_with(expected_root)
    {
        return Err("라이브러리 자산 경로가 올바르지 않습니다.".into());
    }
    Ok(directory.join(relative))
}

pub fn copy_package(source_database: &Path, target_database: &Path) -> Result<(), String> {
    initialize(source_database)?;
    if let Some(parent) = target_database.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::copy(source_database, target_database)
        .map_err(|error| format!("라이브러리 메타데이터를 복사할 수 없습니다: {error}"))?;
    let source_assets = library_directory(source_database).join("assets");
    let target_assets = library_directory(target_database).join("assets");
    if source_assets.exists() {
        copy_directory(&source_assets, &target_assets)?;
    }
    Ok(())
}

pub fn export_package(database: &Path, target: &Path) -> Result<(), String> {
    initialize(database)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temporary = target.with_extension("hlib.tmp");
    let file = fs::File::create(&temporary).map_err(|error| error.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("manifest.json", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(br#"{"format":"harness-designer-library","schemaVersion":1}"#)
        .map_err(|error| error.to_string())?;
    add_file_to_package(&mut zip, database, "library.db", options)?;
    let assets = library_directory(database).join("assets");
    if assets.exists() {
        add_directory_to_package(&mut zip, &assets, Path::new("assets"), options)?;
    }
    zip.finish().map_err(|error| error.to_string())?;
    if target.exists() {
        fs::remove_file(target).map_err(|error| error.to_string())?;
    }
    fs::rename(temporary, target).map_err(|error| error.to_string())
}

pub fn import_package(source: &Path, target_database: &Path) -> Result<(), String> {
    let file = fs::File::open(source)
        .map_err(|error| format!("라이브러리 패키지를 열 수 없습니다: {error}"))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| format!("올바른 .hlib 패키지가 아닙니다: {error}"))?;
    let parent = library_directory(target_database);
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = parent.join(".library-importing");
    if temporary.exists() {
        fs::remove_dir_all(&temporary).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(&temporary).map_err(|error| error.to_string())?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| "라이브러리 패키지에 안전하지 않은 경로가 있습니다.".to_string())?;
        if enclosed == Path::new("manifest.json") {
            continue;
        }
        if enclosed != Path::new("library.db") && !enclosed.starts_with("assets") {
            continue;
        }
        let destination = temporary.join(enclosed);
        if entry.is_dir() {
            fs::create_dir_all(&destination).map_err(|error| error.to_string())?;
        } else {
            if let Some(directory) = destination.parent() {
                fs::create_dir_all(directory).map_err(|error| error.to_string())?;
            }
            let mut output = fs::File::create(&destination).map_err(|error| error.to_string())?;
            std::io::copy(&mut entry, &mut output).map_err(|error| error.to_string())?;
        }
    }
    let imported_database = temporary.join("library.db");
    validate_package_database(&imported_database)?;
    let integrity = check_integrity(&imported_database)?;
    if !integrity.ok {
        let _ = fs::remove_dir_all(&temporary);
        return Err(format!(
            "라이브러리 패키지가 완전하지 않습니다: {}",
            integrity.message
        ));
    }
    if target_database.exists() {
        fs::remove_file(target_database).map_err(|error| error.to_string())?;
    }
    let current_assets = parent.join("assets");
    if current_assets.exists() {
        fs::remove_dir_all(&current_assets).map_err(|error| error.to_string())?;
    }
    fs::rename(imported_database, target_database).map_err(|error| error.to_string())?;
    let imported_assets = temporary.join("assets");
    if imported_assets.exists() {
        fs::rename(imported_assets, current_assets).map_err(|error| error.to_string())?;
    }
    fs::remove_dir_all(temporary).map_err(|error| error.to_string())?;
    initialize(target_database)
}

fn validate_package_database(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err("라이브러리 패키지에 library.db가 없습니다.".into());
    }
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let version: i64 = connection
        .query_row(
            "SELECT schema_version FROM library_info LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "지원하는 라이브러리 메타데이터가 아닙니다.".to_string())?;
    if version != 1 {
        return Err(format!("지원하지 않는 라이브러리 스키마입니다: {version}"));
    }
    Ok(())
}

fn copy_directory(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let destination = target.join(entry.file_name());
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            copy_directory(&entry.path(), &destination)?;
        } else {
            fs::copy(entry.path(), destination).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn add_directory_to_package(
    zip: &mut ZipWriter<fs::File>,
    source: &Path,
    archive_path: &Path,
    options: SimpleFileOptions,
) -> Result<(), String> {
    zip.add_directory(format!("{}/", archive_path.to_string_lossy()), options)
        .map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let next_archive_path = archive_path.join(entry.file_name());
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            add_directory_to_package(zip, &entry.path(), &next_archive_path, options)?;
        } else {
            add_file_to_package(
                zip,
                &entry.path(),
                &next_archive_path.to_string_lossy(),
                options,
            )?;
        }
    }
    Ok(())
}

fn add_file_to_package(
    zip: &mut ZipWriter<fs::File>,
    source: &Path,
    archive_path: &str,
    options: SimpleFileOptions,
) -> Result<(), String> {
    zip.start_file(archive_path.replace('\\', "/"), options)
        .map_err(|error| error.to_string())?;
    let mut file = fs::File::open(source).map_err(|error| error.to_string())?;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        zip.write_all(&buffer[..read])
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ModelAsset, ModelMesh};
    use std::collections::HashSet;

    #[test]
    fn bundled_step_source_is_seeded_without_overwriting_existing_assets() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("library.db");
        let resources = directory.path().join("parts");
        let source = resources.join("molex/430250400.stp");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::write(&source, b"ISO-10303-21;\nEND-ISO-10303-21;").unwrap();

        assert_eq!(seed_builtin_model_assets(&path, &resources).unwrap(), 1);
        assert_eq!(seed_builtin_model_assets(&path, &resources).unwrap(), 0);
        let asset = get_model_asset(&path, "builtin-model-molex-430250400")
            .unwrap()
            .unwrap();
        assert_eq!(asset.source_name, "430250400.stp");
        assert_eq!(
            BASE64.decode(asset.source_data_base64).unwrap(),
            fs::read(source).unwrap()
        );

        seed_default_parts(&path).unwrap();
        let part = list(&path)
            .unwrap()
            .into_iter()
            .find(|part| part.id == "builtin-molex-43025-0400")
            .unwrap();
        assert_eq!(
            part.model_asset_id.as_deref(),
            Some("builtin-model-molex-430250400")
        );
    }

    #[test]
    fn model_asset_round_trip_preserves_step_and_mesh() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("library.db");
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
        assert!(directory.path().join("assets/models/model-1.step").exists());
        assert!(directory
            .path()
            .join("assets/models/model-1.mesh.json")
            .exists());
    }

    #[test]
    fn symbol_asset_round_trip_preserves_svg() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("library.db");
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
        assert!(directory
            .path()
            .join("assets/drawings/symbol-1.svg")
            .exists());
    }

    #[test]
    fn legacy_sample_housings_and_their_orphan_symbols_are_removed() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("library.db");
        initialize(&path).unwrap();
        seed_default_parts(&path).unwrap();
        for (legacy_id, canonical_id) in LEGACY_SAMPLE_PARTS {
            let symbol = SymbolAsset {
                id: format!("{legacy_id}-symbol"),
                name: "Legacy housing drawing".into(),
                source_format: "svg".into(),
                source_name: format!("{legacy_id}.svg"),
                view_box: "0 0 10 10".into(),
                svg: "<svg viewBox=\"0 0 10 10\"></svg>".into(),
            };
            upsert_symbol_asset(&path, &symbol).unwrap();
            let mut legacy = default_parts()
                .unwrap()
                .into_iter()
                .find(|part| part.id == *canonical_id)
                .unwrap();
            legacy.id = (*legacy_id).into();
            legacy.symbol_asset_id = Some(symbol.id.clone());
            upsert(&path, &legacy).unwrap();
        }

        let parts = list(&path).unwrap();

        for (legacy_id, canonical_id) in LEGACY_SAMPLE_PARTS {
            assert!(parts.iter().any(|part| part.id == *canonical_id));
            assert!(!parts.iter().any(|part| part.id == *legacy_id));
            assert!(get_symbol_asset(&path, &format!("{legacy_id}-symbol"))
                .unwrap()
                .is_none());
            assert!(!directory
                .path()
                .join(format!("assets/drawings/{legacy_id}-symbol.svg"))
                .exists());
        }
    }

    #[test]
    fn rotating_backup_keeps_requested_count_and_integrity_is_ok() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("library.db");
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
        let path = directory.path().join("library.db");
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
        let part_numbers = parts
            .iter()
            .map(|part| part.part_number.as_str())
            .collect::<HashSet<_>>();
        assert_eq!(part_numbers.len(), parts.len());
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
        assert!(molex_connector_assets
            .iter()
            .all(|part| part.model_asset_id.is_none()));

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
            .all(|part| part.model_asset_id.is_none()));
    }

    #[test]
    fn external_library_package_round_trip_preserves_assets() {
        let source = tempfile::tempdir().unwrap();
        let target = tempfile::tempdir().unwrap();
        let package_directory = tempfile::tempdir().unwrap();
        let source_database = source.path().join("library.db");
        let target_database = target.path().join("library.db");
        let package = package_directory.path().join("shared.hlib");
        let asset = ModelAsset {
            id: "shared-model".into(),
            name: "Shared model".into(),
            source_format: "step".into(),
            source_name: "shared.step".into(),
            source_data_base64: BASE64.encode(b"ISO-10303-21;"),
            meshes: Vec::new(),
        };
        upsert_model_asset(&source_database, &asset).unwrap();
        export_package(&source_database, &package).unwrap();
        import_package(&package, &target_database).unwrap();

        let loaded = get_model_asset(&target_database, "shared-model")
            .unwrap()
            .unwrap();
        assert_eq!(loaded.source_data_base64, asset.source_data_base64);
        assert!(target
            .path()
            .join("assets/models/shared-model.step")
            .exists());
    }

    #[test]
    fn edited_builtin_part_is_not_overwritten_by_default_seed() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("library.db");
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
