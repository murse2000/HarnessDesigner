use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const DOCUMENT_TYPE: &str = "harness-designer-parts-2d";
const SCHEMA_VERSION: &str = "3";
const DEFAULT_LIBRARY_FILE_NAME: &str = "HarnessDesigner-Default.hlib2d";
const DEFAULT_LIBRARY_NAME: &str = "Harness Designer 기본 부품 라이브러리";
const DEFAULT_PARTS_JSON: &str = include_str!("../resources/default-parts-2d.json");

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPin2d {
    pub number: String,
    pub name: String,
    pub anchor: Option<PinAnchor2d>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PinAnchor2d {
    pub x_mm: f64,
    pub y_mm: f64,
    pub direction_x: f64,
    pub direction_y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DrawingPoint2d {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PartDrawingPath2d {
    pub points: Vec<DrawingPoint2d>,
    pub closed: bool,
    pub layer: String,
    pub source_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UnsupportedEntity2d {
    pub r#type: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PartDrawing2d {
    pub source_name: String,
    pub width_mm: f64,
    pub height_mm: f64,
    pub paths: Vec<PartDrawingPath2d>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outline_strength: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_data_url: Option<String>,
    pub unsupported_entities: Vec<UnsupportedEntity2d>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub editor_state: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCore2d {
    pub name: String,
    pub color: String,
    pub gauge: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPart2d {
    pub id: String,
    pub category: String,
    pub name: String,
    pub part_number: String,
    pub manufacturer: String,
    pub description: String,
    pub outer_diameter_mm: Option<f64>,
    pub pins: Vec<LibraryPin2d>,
    pub cores: Vec<LibraryCore2d>,
    pub drawing: Option<PartDrawing2d>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySummary2d {
    pub path: String,
    pub id: String,
    pub name: String,
    pub revision: String,
    pub part_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPage2d {
    pub summary: LibrarySummary2d,
    pub parts: Vec<LibraryPart2d>,
    pub total: usize,
    pub offset: usize,
    pub limit: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DefaultLibraryInstallation2d {
    pub folder: String,
    pub library: LibrarySummary2d,
}

pub fn create(path: &Path, name: &str) -> Result<LibrarySummary2d, String> {
    if path.exists() {
        return Err("이미 존재하는 파일에는 새 라이브러리를 만들 수 없습니다.".into());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "라이브러리 저장 폴더를 확인할 수 없습니다.".to_string())?;
    if !parent.is_dir() {
        return Err("라이브러리 저장 폴더가 존재하지 않습니다.".into());
    }
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    if let Err(error) = initialize(&connection, name) {
        drop(connection);
        let _ = std::fs::remove_file(path);
        return Err(error);
    }
    summary(path)
}

pub fn summary(path: &Path) -> Result<LibrarySummary2d, String> {
    let mut connection = open(path)?;
    validate_and_migrate(&mut connection)?;
    Ok(LibrarySummary2d {
        path: path.to_string_lossy().to_string(),
        id: meta(&connection, "library_id")?,
        name: meta(&connection, "name")?,
        revision: meta(&connection, "revision")?,
        part_count: connection
            .query_row("SELECT COUNT(*) FROM parts", [], |row| row.get::<_, i64>(0))
            .map_err(|error| error.to_string())? as usize,
    })
}

pub fn query(
    path: &Path,
    query: &str,
    category: Option<&str>,
    offset: usize,
    limit: usize,
) -> Result<LibraryPage2d, String> {
    let connection = open_validated(path)?;
    let limit = limit.clamp(1, 200);
    let normalized = query.trim();
    let pattern = format!("%{normalized}%");
    let category = category.filter(|value| !value.is_empty() && *value != "all");
    let total = match (normalized.is_empty(), category) {
        (true, None) => connection.query_row("SELECT COUNT(*) FROM parts", [], |row| row.get::<_, i64>(0)),
        (true, Some(category)) => connection.query_row("SELECT COUNT(*) FROM parts WHERE category = ?1", params![category], |row| row.get::<_, i64>(0)),
        (false, None) => connection.query_row("SELECT COUNT(*) FROM parts WHERE name LIKE ?1 OR part_number LIKE ?1 OR manufacturer LIKE ?1", params![pattern], |row| row.get::<_, i64>(0)),
        (false, Some(category)) => connection.query_row("SELECT COUNT(*) FROM parts WHERE category = ?1 AND (name LIKE ?2 OR part_number LIKE ?2 OR manufacturer LIKE ?2)", params![category, pattern], |row| row.get::<_, i64>(0)),
    }.map_err(|error| error.to_string())? as usize;

    let sql = match (normalized.is_empty(), category) {
        (true, None) => "SELECT id, category, name, part_number, manufacturer, description, outer_diameter_mm, drawing_json FROM parts ORDER BY manufacturer, part_number LIMIT ?1 OFFSET ?2",
        (true, Some(_)) => "SELECT id, category, name, part_number, manufacturer, description, outer_diameter_mm, drawing_json FROM parts WHERE category = ?3 ORDER BY manufacturer, part_number LIMIT ?1 OFFSET ?2",
        (false, None) => "SELECT id, category, name, part_number, manufacturer, description, outer_diameter_mm, drawing_json FROM parts WHERE name LIKE ?3 OR part_number LIKE ?3 OR manufacturer LIKE ?3 ORDER BY manufacturer, part_number LIMIT ?1 OFFSET ?2",
        (false, Some(_)) => "SELECT id, category, name, part_number, manufacturer, description, outer_diameter_mm, drawing_json FROM parts WHERE category = ?3 AND (name LIKE ?4 OR part_number LIKE ?4 OR manufacturer LIKE ?4) ORDER BY manufacturer, part_number LIMIT ?1 OFFSET ?2",
    };
    let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
    let rows = match (normalized.is_empty(), category) {
        (true, None) => statement.query_map(params![limit as i64, offset as i64], read_part_row),
        (true, Some(category)) => statement.query_map(
            params![limit as i64, offset as i64, category],
            read_part_row,
        ),
        (false, None) => {
            statement.query_map(params![limit as i64, offset as i64, pattern], read_part_row)
        }
        (false, Some(category)) => statement.query_map(
            params![limit as i64, offset as i64, category, pattern],
            read_part_row,
        ),
    }
    .map_err(|error| error.to_string())?;
    let mut parts = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    for part in &mut parts {
        part.pins = read_pins(&connection, &part.id)?;
        part.cores = read_cores(&connection, &part.id)?;
    }

    Ok(LibraryPage2d {
        summary: summary(path)?,
        parts,
        total,
        offset,
        limit,
    })
}

pub fn upsert(path: &Path, mut part: LibraryPart2d) -> Result<LibraryPart2d, String> {
    validate_part(&part)?;
    let mut connection = open_validated(path)?;
    if part.id.trim().is_empty() {
        part.id = format!("part-{}", uuid::Uuid::new_v4());
    }
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction.execute(
        "INSERT INTO parts (id, category, name, part_number, manufacturer, description, outer_diameter_mm, drawing_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET category=excluded.category, name=excluded.name, part_number=excluded.part_number, manufacturer=excluded.manufacturer, description=excluded.description, outer_diameter_mm=excluded.outer_diameter_mm, drawing_json=excluded.drawing_json",
        params![part.id, part.category, part.name.trim(), part.part_number.trim(), part.manufacturer.trim(), part.description.trim(), part.outer_diameter_mm, part.drawing.as_ref().map(serde_json::to_string).transpose().map_err(|error| error.to_string())?],
    ).map_err(|error| format!("부품을 저장할 수 없습니다: {error}"))?;
    transaction
        .execute("DELETE FROM pins WHERE part_id = ?1", params![part.id])
        .map_err(|error| error.to_string())?;
    for (position, pin) in part.pins.iter().enumerate() {
        transaction.execute(
            "INSERT INTO pins (part_id, position, number, name, anchor_x_mm, anchor_y_mm, direction_x, direction_y) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![part.id, position as i64, pin.number.trim(), pin.name.trim(), pin.anchor.as_ref().map(|anchor| anchor.x_mm), pin.anchor.as_ref().map(|anchor| anchor.y_mm), pin.anchor.as_ref().map(|anchor| anchor.direction_x), pin.anchor.as_ref().map(|anchor| anchor.direction_y)],
        ).map_err(|error| error.to_string())?;
    }
    transaction
        .execute("DELETE FROM cores WHERE part_id = ?1", params![part.id])
        .map_err(|error| error.to_string())?;
    for (position, core) in part.cores.iter().enumerate() {
        transaction.execute(
            "INSERT INTO cores (part_id, position, name, color, gauge) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![part.id, position as i64, core.name.trim(), core.color.trim(), core.gauge.trim()],
        ).map_err(|error| error.to_string())?;
    }
    increment_revision(&transaction)?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(part)
}

pub fn delete(path: &Path, part_id: &str) -> Result<(), String> {
    let mut connection = open_validated(path)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let changed = transaction
        .execute("DELETE FROM parts WHERE id = ?1", params![part_id])
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("삭제할 부품을 찾을 수 없습니다.".into());
    }
    increment_revision(&transaction)?;
    transaction.commit().map_err(|error| error.to_string())
}

pub fn selected_path(settings_directory: &Path) -> Result<Option<PathBuf>, String> {
    let path = settings_directory.join("rebuild2d-library-path.json");
    if !path.exists() {
        return Ok(None);
    }
    let value: serde_json::Value =
        serde_json::from_slice(&std::fs::read(path).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
    Ok(value
        .get("path")
        .and_then(serde_json::Value::as_str)
        .map(PathBuf::from))
}

pub fn set_selected_path(settings_directory: &Path, library_path: &Path) -> Result<(), String> {
    std::fs::create_dir_all(settings_directory).map_err(|error| error.to_string())?;
    let settings_path = settings_directory.join("rebuild2d-library-path.json");
    let temporary_path = settings_directory.join(format!(
        ".rebuild2d-library-path.{}.tmp",
        uuid::Uuid::new_v4()
    ));
    let content = serde_json::to_vec_pretty(&serde_json::json!({ "path": library_path }))
        .map_err(|error| error.to_string())?;
    std::fs::write(&temporary_path, content).map_err(|error| error.to_string())?;
    std::fs::rename(&temporary_path, settings_path).map_err(|error| error.to_string())
}

pub fn default_library_folder(settings_directory: &Path) -> Result<Option<PathBuf>, String> {
    let path = settings_directory.join("rebuild2d-default-library-folder.json");
    if !path.exists() {
        return Ok(None);
    }
    let value: serde_json::Value =
        serde_json::from_slice(&std::fs::read(path).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
    Ok(value
        .get("folder")
        .and_then(serde_json::Value::as_str)
        .map(PathBuf::from))
}

pub fn install_default_library(
    settings_directory: &Path,
    folder: &Path,
) -> Result<DefaultLibraryInstallation2d, String> {
    std::fs::create_dir_all(folder)
        .map_err(|error| format!("기본 라이브러리 폴더를 만들 수 없습니다: {error}"))?;
    if !folder.is_dir() {
        return Err("기본 라이브러리 폴더가 아닙니다.".into());
    }
    let library_path = folder.join(DEFAULT_LIBRARY_FILE_NAME);
    if library_path.exists() {
        summary(&library_path)?;
    } else {
        create_seeded_default_library(&library_path)?;
    }
    persist_default_library_folder(settings_directory, folder)?;
    set_selected_path(settings_directory, &library_path)?;
    Ok(DefaultLibraryInstallation2d {
        folder: folder.to_string_lossy().to_string(),
        library: summary(&library_path)?,
    })
}

pub fn ensure_default_library(
    settings_directory: &Path,
) -> Result<DefaultLibraryInstallation2d, String> {
    if let Some(path) = selected_path(settings_directory)? {
        if let Ok(library) = summary(&path) {
            let folder = default_library_folder(settings_directory)?
                .or_else(|| path.parent().map(Path::to_path_buf))
                .unwrap_or_else(|| settings_directory.join("Libraries"));
            return Ok(DefaultLibraryInstallation2d {
                folder: folder.to_string_lossy().to_string(),
                library,
            });
        }
    }
    let folder = default_library_folder(settings_directory)?
        .unwrap_or_else(|| settings_directory.join("Libraries"));
    install_default_library(settings_directory, &folder)
}

fn create_seeded_default_library(path: &Path) -> Result<(), String> {
    let parts: Vec<LibraryPart2d> = serde_json::from_str(DEFAULT_PARTS_JSON)
        .map_err(|error| format!("기본 부품 카탈로그를 읽을 수 없습니다: {error}"))?;
    create(path, DEFAULT_LIBRARY_NAME)?;
    for part in parts {
        if let Err(error) = upsert(path, part) {
            let _ = std::fs::remove_file(path);
            return Err(format!("기본 부품 라이브러리를 만들 수 없습니다: {error}"));
        }
    }
    Ok(())
}

fn persist_default_library_folder(settings_directory: &Path, folder: &Path) -> Result<(), String> {
    std::fs::create_dir_all(settings_directory).map_err(|error| error.to_string())?;
    let settings_path = settings_directory.join("rebuild2d-default-library-folder.json");
    let temporary_path = settings_directory.join(format!(
        ".rebuild2d-default-library-folder.{}.tmp",
        uuid::Uuid::new_v4()
    ));
    let content = serde_json::to_vec_pretty(&serde_json::json!({ "folder": folder }))
        .map_err(|error| error.to_string())?;
    std::fs::write(&temporary_path, content).map_err(|error| error.to_string())?;
    std::fs::rename(&temporary_path, settings_path).map_err(|error| error.to_string())
}

fn initialize(connection: &Connection, name: &str) -> Result<(), String> {
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;
         CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
         CREATE TABLE parts (
           id TEXT PRIMARY KEY,
           category TEXT NOT NULL,
           name TEXT NOT NULL,
           part_number TEXT NOT NULL,
           manufacturer TEXT NOT NULL,
           description TEXT NOT NULL,
           outer_diameter_mm REAL,
           drawing_json TEXT,
           UNIQUE(manufacturer, part_number)
         );
         CREATE TABLE cores (
           part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
           position INTEGER NOT NULL,
           name TEXT NOT NULL,
           color TEXT NOT NULL,
           gauge TEXT NOT NULL,
           PRIMARY KEY(part_id, position)
         );
         CREATE TABLE pins (
           part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
           position INTEGER NOT NULL,
           number TEXT NOT NULL,
           name TEXT NOT NULL,
           anchor_x_mm REAL,
           anchor_y_mm REAL,
           direction_x REAL,
           direction_y REAL,
           PRIMARY KEY(part_id, position)
         );
         CREATE INDEX parts_search ON parts(manufacturer, part_number, name);",
        )
        .map_err(|error| error.to_string())?;
    let values = [
        ("document_type", DOCUMENT_TYPE.to_string()),
        ("schema_version", SCHEMA_VERSION.to_string()),
        ("library_id", format!("library-{}", uuid::Uuid::new_v4())),
        ("name", name.trim().to_string()),
        ("revision", "1".to_string()),
    ];
    for (key, value) in values {
        connection
            .execute(
                "INSERT INTO meta (key, value) VALUES (?1, ?2)",
                params![key, value],
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn open(path: &Path) -> Result<Connection, String> {
    if !path.is_file() {
        return Err("지정한 부품 라이브러리 파일이 없습니다.".into());
    }
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn open_validated(path: &Path) -> Result<Connection, String> {
    let mut connection = open(path)?;
    validate_and_migrate(&mut connection)?;
    Ok(connection)
}

fn meta(connection: &Connection, key: &str) -> Result<String, String> {
    connection
        .query_row(
            "SELECT value FROM meta WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "라이브러리 메타데이터가 손상되었습니다.".to_string())
}

fn read_part_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryPart2d> {
    let drawing_json: Option<String> = row.get(7)?;
    let drawing = drawing_json
        .map(|value| serde_json::from_str(&value))
        .transpose()
        .map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                7,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?;
    Ok(LibraryPart2d {
        id: row.get(0)?,
        category: row.get(1)?,
        name: row.get(2)?,
        part_number: row.get(3)?,
        manufacturer: row.get(4)?,
        description: row.get(5)?,
        outer_diameter_mm: row.get(6)?,
        pins: Vec::new(),
        cores: Vec::new(),
        drawing,
    })
}

fn read_pins(connection: &Connection, part_id: &str) -> Result<Vec<LibraryPin2d>, String> {
    let mut statement = connection.prepare("SELECT number, name, anchor_x_mm, anchor_y_mm, direction_x, direction_y FROM pins WHERE part_id = ?1 ORDER BY position").map_err(|error| error.to_string())?;
    let pins = statement
        .query_map(params![part_id], |row| {
            let x_mm: Option<f64> = row.get(2)?;
            let y_mm: Option<f64> = row.get(3)?;
            let direction_x: Option<f64> = row.get(4)?;
            let direction_y: Option<f64> = row.get(5)?;
            let anchor = match (x_mm, y_mm, direction_x, direction_y) {
                (Some(x_mm), Some(y_mm), Some(direction_x), Some(direction_y)) => {
                    Some(PinAnchor2d {
                        x_mm,
                        y_mm,
                        direction_x,
                        direction_y,
                    })
                }
                _ => None,
            };
            Ok(LibraryPin2d {
                number: row.get(0)?,
                name: row.get(1)?,
                anchor,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(pins)
}

fn read_cores(connection: &Connection, part_id: &str) -> Result<Vec<LibraryCore2d>, String> {
    let mut statement = connection
        .prepare("SELECT name, color, gauge FROM cores WHERE part_id = ?1 ORDER BY position")
        .map_err(|error| error.to_string())?;
    let cores = statement
        .query_map(params![part_id], |row| {
            Ok(LibraryCore2d {
                name: row.get(0)?,
                color: row.get(1)?,
                gauge: row.get(2)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(cores)
}

fn validate_part(part: &LibraryPart2d) -> Result<(), String> {
    if !matches!(part.category.as_str(), "housing" | "wire" | "cable") {
        return Err("지원하지 않는 부품 카테고리입니다.".into());
    }
    if part.name.trim().is_empty()
        || part.part_number.trim().is_empty()
        || part.manufacturer.trim().is_empty()
    {
        return Err("파트명, 파트번호, 제조사를 모두 입력하세요.".into());
    }
    match part.category.as_str() {
        "housing" if part.pins.is_empty() || part.pins.len() > 256 => {
            return Err("핀 수는 1~256개여야 합니다.".into())
        }
        "housing" if part.pins.iter().any(|pin| pin.number.trim().is_empty()) => {
            return Err("모든 핀 번호를 입력하세요.".into())
        }
        "housing"
            if part.drawing.as_ref().is_some_and(|drawing| {
                !drawing.width_mm.is_finite()
                    || !drawing.height_mm.is_finite()
                    || drawing.width_mm <= 0.0
                    || drawing.height_mm <= 0.0
                    || drawing.outline_strength.is_some_and(|strength| {
                        !strength.is_finite() || !(0.5..=4.0).contains(&strength)
                    })
                    || (drawing.paths.is_empty()
                        && drawing.image_data_url.as_ref().is_none_or(|image| {
                            !image.starts_with("data:image/png;base64,")
                                && !image.starts_with("data:image/jpeg;base64,")
                                && !image.starts_with("data:image/webp;base64,")
                                && !image.starts_with("data:image/svg+xml;charset=utf-8,")
                        }))
            }) =>
        {
            return Err("2D 도면의 크기와 형상을 확인하세요.".into())
        }
        "housing"
            if part.pins.iter().any(|pin| {
                pin.anchor.as_ref().is_some_and(|anchor| {
                    !anchor.x_mm.is_finite()
                        || !anchor.y_mm.is_finite()
                        || !anchor.direction_x.is_finite()
                        || !anchor.direction_y.is_finite()
                })
            }) =>
        {
            return Err("핀 접속점 좌표를 확인하세요.".into())
        }
        "wire" if part.cores.len() != 1 => {
            return Err("단선은 도체 정의가 한 개여야 합니다.".into())
        }
        "cable" if part.cores.len() < 2 || part.cores.len() > 256 => {
            return Err("멀티코어 케이블의 코어 수는 2~256개여야 합니다.".into())
        }
        "wire" | "cable"
            if part
                .outer_diameter_mm
                .is_none_or(|value| !value.is_finite() || value <= 0.0) =>
        {
            return Err("전선 또는 케이블 외경은 0보다 커야 합니다.".into())
        }
        "wire" | "cable"
            if part.cores.iter().any(|core| {
                core.name.trim().is_empty()
                    || core.color.trim().is_empty()
                    || core.gauge.trim().is_empty()
            }) =>
        {
            return Err("모든 코어의 이름, 색상, 규격을 입력하세요.".into())
        }
        _ => {}
    }
    Ok(())
}

fn validate_and_migrate(connection: &mut Connection) -> Result<(), String> {
    if meta(connection, "document_type")? != DOCUMENT_TYPE {
        return Err("새 2D 부품 라이브러리 형식이 아닙니다.".into());
    }
    match meta(connection, "schema_version")?.as_str() {
        SCHEMA_VERSION => Ok(()),
        "2" => {
            let transaction = connection
                .transaction()
                .map_err(|error| error.to_string())?;
            transaction
                .execute_batch(
                    "ALTER TABLE parts ADD COLUMN drawing_json TEXT;
                 ALTER TABLE pins ADD COLUMN anchor_x_mm REAL;
                 ALTER TABLE pins ADD COLUMN anchor_y_mm REAL;
                 ALTER TABLE pins ADD COLUMN direction_x REAL;
                 ALTER TABLE pins ADD COLUMN direction_y REAL;
                 UPDATE meta SET value = '3' WHERE key = 'schema_version';",
                )
                .map_err(|error| format!("2D 부품 라이브러리를 갱신할 수 없습니다: {error}"))?;
            transaction.commit().map_err(|error| error.to_string())
        }
        _ => Err("지원하지 않는 2D 부품 라이브러리 버전입니다.".into()),
    }
}

fn increment_revision(transaction: &rusqlite::Transaction<'_>) -> Result<(), String> {
    let revision = meta(transaction, "revision")?
        .parse::<u64>()
        .map_err(|error| error.to_string())?
        + 1;
    transaction
        .execute(
            "UPDATE meta SET value = ?1 WHERE key = 'revision'",
            params![revision.to_string()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn part() -> LibraryPart2d {
        LibraryPart2d {
            id: String::new(),
            category: "housing".into(),
            name: "4핀 하우징".into(),
            part_number: "TEST-04".into(),
            manufacturer: "Test".into(),
            description: "Test housing".into(),
            outer_diameter_mm: None,
            pins: (1..=4)
                .map(|number| LibraryPin2d {
                    number: number.to_string(),
                    name: "PIN".into(),
                    anchor: None,
                })
                .collect(),
            cores: Vec::new(),
            drawing: None,
        }
    }

    #[test]
    fn creates_queries_updates_and_deletes_external_library() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("parts.hlib2d");
        let created = create(&path, "Production Parts").unwrap();
        assert_eq!(created.part_count, 0);

        let saved = upsert(&path, part()).unwrap();
        let page = query(&path, "TEST-04", Some("housing"), 0, 50).unwrap();
        assert_eq!(page.parts, vec![saved.clone()]);
        assert_eq!(page.summary.part_count, 1);
        assert_eq!(page.summary.revision, "2");

        delete(&path, &saved.id).unwrap();
        assert_eq!(query(&path, "", None, 0, 50).unwrap().total, 0);
    }

    #[test]
    fn stores_connector_drawing_and_pin_anchor() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("parts.hlib2d");
        create(&path, "Parts").unwrap();
        let mut drawing_part = part();
        drawing_part.pins[0].anchor = Some(PinAnchor2d {
            x_mm: 10.0,
            y_mm: 4.0,
            direction_x: 1.0,
            direction_y: 0.0,
        });
        drawing_part.drawing = Some(PartDrawing2d {
            source_name: "vendor.dxf".into(),
            width_mm: 20.0,
            height_mm: 8.0,
            paths: vec![PartDrawingPath2d {
                points: vec![
                    DrawingPoint2d { x: 0.0, y: 0.0 },
                    DrawingPoint2d { x: 20.0, y: 0.0 },
                ],
                closed: false,
                layer: "OUTLINE".into(),
                source_type: "LINE".into(),
            }],
            outline_strength: Some(2.5),
            image_data_url: None,
            unsupported_entities: vec![UnsupportedEntity2d {
                r#type: "TEXT".into(),
                count: 2,
            }],
            editor_state: Some(serde_json::json!({
                "selection": { "x": 12.0, "y": 8.0, "width": 20.0, "height": 8.0 },
            })),
        });

        let saved = upsert(&path, drawing_part).unwrap();
        let reopened = query(&path, "TEST-04", Some("housing"), 0, 10)
            .unwrap()
            .parts
            .remove(0);

        assert_eq!(reopened, saved);
        assert_eq!(reopened.pins[0].anchor.as_ref().unwrap().x_mm, 10.0);
        assert_eq!(reopened.drawing.as_ref().unwrap().source_name, "vendor.dxf");
        assert_eq!(reopened.drawing.as_ref().unwrap().outline_strength, Some(2.5));
        assert_eq!(reopened.drawing.as_ref().unwrap().editor_state, saved.drawing.as_ref().unwrap().editor_state);
    }

    #[test]
    fn stores_cropped_image_connector_drawing() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("parts.hlib2d");
        create(&path, "Parts").unwrap();
        let mut drawing_part = part();
        drawing_part.drawing = Some(PartDrawing2d {
            source_name: "vendor.png".into(),
            width_mm: 18.0,
            height_mm: 9.0,
            paths: Vec::new(),
            outline_strength: None,
            image_data_url: Some("data:image/png;base64,AA==".into()),
            unsupported_entities: Vec::new(),
            editor_state: None,
        });

        upsert(&path, drawing_part).unwrap();
        let reopened = query(&path, "TEST-04", Some("housing"), 0, 10)
            .unwrap()
            .parts
            .remove(0);

        let drawing = reopened.drawing.unwrap();
        assert_eq!(drawing.source_name, "vendor.png");
        assert!(drawing.paths.is_empty());
        assert!(drawing.image_data_url.unwrap().starts_with("data:image/png;base64,"));
    }

    #[test]
    fn stores_step_projected_svg_connector_drawing() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("parts.hlib2d");
        create(&path, "Parts").unwrap();
        let mut drawing_part = part();
        drawing_part.drawing = Some(PartDrawing2d {
            source_name: "housing.stp · STEP 투영".into(),
            width_mm: 18.0,
            height_mm: 9.0,
            paths: Vec::new(),
            outline_strength: Some(2.0),
            image_data_url: Some("data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E".into()),
            unsupported_entities: Vec::new(),
            editor_state: Some(serde_json::json!({
                "selection": { "x": 0.0, "y": 0.0, "width": 18.0, "height": 9.0 },
            })),
        });

        let saved = upsert(&path, drawing_part).unwrap();
        let reopened = query(&path, "TEST-04", Some("housing"), 0, 10)
            .unwrap()
            .parts
            .remove(0);

        assert_eq!(reopened, saved);
        assert!(reopened
            .drawing
            .unwrap()
            .image_data_url
            .unwrap()
            .starts_with("data:image/svg+xml;charset=utf-8,"));
    }

    #[test]
    fn rejects_duplicate_manufacturer_and_part_number() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("parts.hlib2d");
        create(&path, "Parts").unwrap();
        upsert(&path, part()).unwrap();
        assert!(upsert(&path, part()).is_err());
    }

    #[test]
    fn persists_selected_library_path() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("parts.hlib2d");
        set_selected_path(directory.path(), &path).unwrap();
        assert_eq!(selected_path(directory.path()).unwrap(), Some(path));
    }

    #[test]
    fn stores_and_filters_wire_and_multicore_parts() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("parts.hlib2d");
        create(&path, "Parts").unwrap();
        upsert(
            &path,
            LibraryPart2d {
                id: String::new(),
                category: "wire".into(),
                name: "20 AWG 단선".into(),
                part_number: "WIRE-20".into(),
                manufacturer: "Test".into(),
                description: String::new(),
                outer_diameter_mm: Some(1.6),
                pins: Vec::new(),
                cores: vec![LibraryCore2d {
                    name: "WIRE".into(),
                    color: "RD".into(),
                    gauge: "20 AWG".into(),
                }],
                drawing: None,
            },
        )
        .unwrap();
        upsert(
            &path,
            LibraryPart2d {
                id: String::new(),
                category: "cable".into(),
                name: "4C 케이블".into(),
                part_number: "CABLE-4".into(),
                manufacturer: "Test".into(),
                description: String::new(),
                outer_diameter_mm: Some(6.0),
                pins: Vec::new(),
                cores: (1..=4)
                    .map(|index| LibraryCore2d {
                        name: format!("CORE {index}"),
                        color: "BK".into(),
                        gauge: "22 AWG".into(),
                    })
                    .collect(),
                drawing: None,
            },
        )
        .unwrap();

        assert_eq!(
            query(&path, "", Some("wire"), 0, 50).unwrap().parts[0]
                .cores
                .len(),
            1
        );
        assert_eq!(
            query(&path, "", Some("cable"), 0, 50).unwrap().parts[0]
                .cores
                .len(),
            4
        );
        assert_eq!(query(&path, "", None, 0, 50).unwrap().total, 2);
    }

    #[test]
    fn installs_default_library_and_persists_its_folder() {
        let settings = tempfile::tempdir().unwrap();
        let libraries = tempfile::tempdir().unwrap();

        let installed = install_default_library(settings.path(), libraries.path()).unwrap();

        assert_eq!(installed.folder, libraries.path().to_string_lossy());
        assert_eq!(installed.library.part_count, 8);
        assert_eq!(
            default_library_folder(settings.path()).unwrap(),
            Some(libraries.path().to_path_buf())
        );
        assert_eq!(
            selected_path(settings.path()).unwrap(),
            Some(PathBuf::from(&installed.library.path))
        );
        assert_eq!(
            query(
                Path::new(&installed.library.path),
                "",
                Some("housing"),
                0,
                50
            )
            .unwrap()
            .total,
            4
        );
        assert_eq!(
            query(Path::new(&installed.library.path), "", Some("wire"), 0, 50)
                .unwrap()
                .total,
            2
        );
        assert_eq!(
            query(Path::new(&installed.library.path), "", Some("cable"), 0, 50)
                .unwrap()
                .total,
            2
        );
    }

    #[test]
    fn reinstalling_default_library_does_not_overwrite_user_parts() {
        let settings = tempfile::tempdir().unwrap();
        let libraries = tempfile::tempdir().unwrap();
        let installed = install_default_library(settings.path(), libraries.path()).unwrap();
        upsert(Path::new(&installed.library.path), part()).unwrap();

        let reopened = install_default_library(settings.path(), libraries.path()).unwrap();

        assert_eq!(reopened.library.part_count, 9);
        assert_eq!(
            query(Path::new(&reopened.library.path), "TEST-04", None, 0, 50)
                .unwrap()
                .total,
            1
        );
    }

    #[test]
    fn ensures_default_library_in_app_data_when_no_library_is_selected() {
        let settings = tempfile::tempdir().unwrap();

        let installed = ensure_default_library(settings.path()).unwrap();

        assert_eq!(
            Path::new(&installed.library.path).parent(),
            Some(settings.path().join("Libraries").as_path())
        );
        assert_eq!(installed.library.part_count, 8);
    }
}
