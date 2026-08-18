mod app_settings;
mod export;
mod library;
mod model;
mod project_file;
mod session;

use model::{
    BomExportRow, ContinuityTestExportRow, ContinuityTestResultExportRow, CutExportRow,
    HarnessBomExportRow, ModelAsset, PartSnapshot, ProjectDocument, SessionSnapshot,
};
use serde::Serialize;
use session::ProjectSessionManager;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

#[tauri::command]
fn create_project(
    project: ProjectDocument,
    sessions: State<ProjectSessionManager>,
) -> SessionSnapshot {
    sessions.create(project)
}

#[tauri::command]
fn get_session(
    session_id: String,
    sessions: State<ProjectSessionManager>,
) -> Result<SessionSnapshot, String> {
    sessions.get(&session_id)
}

#[tauri::command]
fn replace_project(
    app: AppHandle,
    session_id: String,
    project: ProjectDocument,
    sessions: State<ProjectSessionManager>,
) -> Result<SessionSnapshot, String> {
    sessions.replace(&app, &session_id, project)
}

#[tauri::command]
fn undo_project(
    app: AppHandle,
    session_id: String,
    sessions: State<ProjectSessionManager>,
) -> Result<SessionSnapshot, String> {
    sessions.undo(&app, &session_id)
}

#[tauri::command]
fn redo_project(
    app: AppHandle,
    session_id: String,
    sessions: State<ProjectSessionManager>,
) -> Result<SessionSnapshot, String> {
    sessions.redo(&app, &session_id)
}

#[tauri::command]
fn open_project(
    path: String,
    sessions: State<ProjectSessionManager>,
) -> Result<SessionSnapshot, String> {
    let path = PathBuf::from(path);
    if let Some(snapshot) = sessions.find_by_path(&path) {
        return Ok(snapshot);
    }
    let project = project_file::read_project(&path)?;
    let (read_only, lock_path) = project_file::acquire_lock(&path)?;
    Ok(sessions.insert_opened(project, path, read_only, lock_path))
}

#[tauri::command]
fn save_project(
    app: AppHandle,
    session_id: String,
    path: String,
    sessions: State<ProjectSessionManager>,
) -> Result<SessionSnapshot, String> {
    let snapshot = sessions.get(&session_id)?;
    if snapshot.read_only {
        return Err("읽기 전용 프로젝트는 저장할 수 없습니다.".into());
    }
    let path = PathBuf::from(path);
    let project_id = snapshot.project.id.clone();
    let mut project = snapshot.project;
    project.updated_at = chrono_like_now();
    let same_path = snapshot.path.as_deref() == Some(path.to_string_lossy().as_ref());
    let lock_path = if same_path {
        None
    } else {
        let (read_only, lock_path) = project_file::acquire_lock(&path)?;
        if read_only {
            return Err("다른 사용자가 편집 중인 프로젝트 경로입니다.".into());
        }
        lock_path
    };
    if let Err(error) = project_file::write_project(&path, &project) {
        if let Some(lock) = &lock_path {
            let _ = std::fs::remove_file(lock);
        }
        return Err(error);
    }
    let recovery_directory = app_data_path(&app)?
        .join("recovery")
        .join(project_id.replace(
            |character: char| {
                !character.is_ascii_alphanumeric() && character != '-' && character != '_'
            },
            "_",
        ));
    if recovery_directory.exists() {
        let _ = std::fs::remove_dir_all(recovery_directory);
    }
    sessions.mark_saved(&app, &session_id, path, lock_path)
}

#[tauri::command]
fn close_project(session_id: String, sessions: State<ProjectSessionManager>) -> Result<(), String> {
    sessions.close(&session_id)
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    export::write_text(&PathBuf::from(path), &content)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_binary_file(path: String, content: Vec<u8>) -> Result<(), String> {
    export::write_binary(&PathBuf::from(path), &content)
}

#[tauri::command]
fn export_xlsx(
    path: String,
    bom: Vec<BomExportRow>,
    harness_bom: Vec<HarnessBomExportRow>,
    cuts: Vec<CutExportRow>,
    tests: Vec<ContinuityTestExportRow>,
    test_results: Vec<ContinuityTestResultExportRow>,
) -> Result<(), String> {
    export::write_xlsx(
        &PathBuf::from(path),
        &bom,
        &harness_bom,
        &cuts,
        &tests,
        &test_results,
    )
}

#[tauri::command]
fn export_solidworks_routing_package(
    path: String,
    entries: Vec<export::RoutingPackageEntry>,
    from_to_rows: Vec<Vec<String>>,
    cable_library_rows: Vec<Vec<String>>,
) -> Result<(), String> {
    export::write_solidworks_routing_package(
        &PathBuf::from(path),
        &entries,
        &from_to_rows,
        &cable_library_rows,
    )
}

fn app_data_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn library_path(app: &AppHandle) -> Result<PathBuf, String> {
    app_settings::library_path(&app_data_path(app)?)
}

fn prepare_library(app: &AppHandle) -> Result<PathBuf, String> {
    let path = library_path(app)?;
    library::initialize(&path)?;
    #[cfg(desktop)]
    {
        let resources = app
            .path()
            .resource_dir()
            .map_err(|error| error.to_string())?;
        library::seed_builtin_model_assets(&path, &resources.join("parts"))?;
    }
    Ok(path)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryStatus {
    directory: String,
    database_path: String,
    part_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryEntry {
    path: String,
    project_name: String,
    project_number: String,
    updated_at: String,
}

fn backup_library(app: &AppHandle, path: &Path) -> Result<(), String> {
    let retention = app_settings::library_backup_retention(&app_data_path(app)?)?;
    library::create_rotating_backup(path, retention)
}

#[tauri::command]
fn get_library_status(app: AppHandle) -> Result<LibraryStatus, String> {
    let path = prepare_library(&app)?;
    let part_count = library::list(&path)?.len();
    Ok(LibraryStatus {
        directory: path
            .parent()
            .unwrap_or(Path::new(""))
            .to_string_lossy()
            .to_string(),
        database_path: path.to_string_lossy().to_string(),
        part_count,
    })
}

#[tauri::command]
fn set_library_directory(
    app: AppHandle,
    directory: String,
    copy_existing: bool,
) -> Result<LibraryStatus, String> {
    let app_data = app_data_path(&app)?;
    let current =
        app_settings::library_path(&app_data).unwrap_or_else(|_| app_data.join("library.db"));
    let directory = PathBuf::from(directory);
    if !directory.is_dir() {
        return Err("선택한 라이브러리 폴더가 존재하지 않습니다.".into());
    }
    let target = directory.join("library.db");
    if copy_existing && current.exists() && current != target && !target.exists() {
        library::copy_package(&current, &target)?;
    }
    library::initialize(&target)?;
    app_settings::set_library_directory(&app_data, &directory)?;
    get_library_status(app)
}

#[tauri::command]
fn export_library_database(app: AppHandle, path: String) -> Result<(), String> {
    let source = library_path(&app)?;
    let target = PathBuf::from(path);
    library::export_package(&source, &target)
}

#[tauri::command]
fn import_library_database(app: AppHandle, path: String) -> Result<LibraryStatus, String> {
    let source = PathBuf::from(path);
    let target = library_path(&app)?;
    if let (Ok(source), Ok(target)) = (source.canonicalize(), target.canonicalize()) {
        if source == target {
            return get_library_status(app);
        }
    }
    backup_library(&app, &target)?;
    library::import_package(&source, &target)?;
    get_library_status(app)
}

#[tauri::command]
fn list_library_parts(app: AppHandle) -> Result<Vec<PartSnapshot>, String> {
    library::list(&prepare_library(&app)?)
}

#[tauri::command]
fn upsert_library_part(app: AppHandle, part: PartSnapshot) -> Result<(), String> {
    let path = library_path(&app)?;
    backup_library(&app, &path)?;
    library::upsert(&path, &part)
}

#[tauri::command]
fn get_library_model_asset(app: AppHandle, asset_id: String) -> Result<Option<ModelAsset>, String> {
    library::get_model_asset(&library_path(&app)?, &asset_id)
}

#[tauri::command]
fn upsert_library_model_asset(app: AppHandle, asset: ModelAsset) -> Result<(), String> {
    let path = library_path(&app)?;
    backup_library(&app, &path)?;
    library::upsert_model_asset(&path, &asset)
}

#[tauri::command]
fn get_library_symbol_asset(
    app: AppHandle,
    asset_id: String,
) -> Result<Option<model::SymbolAsset>, String> {
    library::get_symbol_asset(&library_path(&app)?, &asset_id)
}

#[tauri::command]
fn upsert_library_symbol_asset(app: AppHandle, asset: model::SymbolAsset) -> Result<(), String> {
    let path = library_path(&app)?;
    backup_library(&app, &path)?;
    library::upsert_symbol_asset(&path, &asset)
}

#[tauri::command]
fn set_library_backup_retention(app: AppHandle, retention: usize) -> Result<(), String> {
    app_settings::set_library_backup_retention(&app_data_path(&app)?, retention)
}

#[tauri::command]
fn check_library_integrity(app: AppHandle) -> Result<library::LibraryIntegrity, String> {
    library::check_integrity(&library_path(&app)?)
}

#[tauri::command]
fn save_recovery_snapshot(
    app: AppHandle,
    session_id: String,
    retention: usize,
    sessions: State<ProjectSessionManager>,
) -> Result<(), String> {
    let snapshot = sessions.get(&session_id)?;
    if !snapshot.dirty || snapshot.read_only || retention == 0 {
        return Ok(());
    }
    let directory = app_data_path(&app)?
        .join("recovery")
        .join(snapshot.project.id.replace(
            |character: char| {
                !character.is_ascii_alphanumeric() && character != '-' && character != '_'
            },
            "_",
        ));
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    project_file::write_project(
        &directory.join(format!("{nanos}.harness")),
        &snapshot.project,
    )?;
    let mut entries = std::fs::read_dir(&directory)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .path()
                .extension()
                .is_some_and(|extension| extension == "harness")
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());
    let remove_count = entries.len().saturating_sub(retention.min(100));
    for entry in entries.into_iter().take(remove_count) {
        std::fs::remove_file(entry.path()).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn list_recovery_snapshots(app: AppHandle) -> Result<Vec<RecoveryEntry>, String> {
    let root = app_data_path(&app)?.join("recovery");
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut recoveries = Vec::new();
    for directory in std::fs::read_dir(root)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
    {
        if !directory.path().is_dir() {
            continue;
        }
        for entry in std::fs::read_dir(directory.path())
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
        {
            let path = entry.path();
            if path
                .extension()
                .is_none_or(|extension| extension != "harness")
            {
                continue;
            }
            if let Ok(project) = project_file::read_project(&path) {
                recoveries.push(RecoveryEntry {
                    path: path.to_string_lossy().to_string(),
                    project_name: project.name,
                    project_number: project.project_number,
                    updated_at: project.updated_at,
                });
            }
        }
    }
    recoveries.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(recoveries)
}

#[tauri::command]
fn open_recovery_snapshot(
    app: AppHandle,
    path: String,
    sessions: State<ProjectSessionManager>,
) -> Result<SessionSnapshot, String> {
    let root = app_data_path(&app)?
        .join("recovery")
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let target = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !target.starts_with(root)
        || target
            .extension()
            .is_none_or(|extension| extension != "harness")
    {
        return Err("복구본 경로가 올바르지 않습니다.".into());
    }
    Ok(sessions.create_recovered(project_file::read_project(&target)?))
}

#[tauri::command]
fn delete_recovery_snapshot(app: AppHandle, path: String) -> Result<(), String> {
    let root = app_data_path(&app)?
        .join("recovery")
        .canonicalize()
        .map_err(|error| error.to_string())?;
    delete_recovery_files(&root, &[path])
}

fn delete_recovery_files(root: &Path, paths: &[String]) -> Result<(), String> {
    let targets = paths
        .iter()
        .map(|path| {
            let target = PathBuf::from(path)
                .canonicalize()
                .map_err(|error| error.to_string())?;
            if !target.starts_with(root)
                || target
                    .extension()
                    .is_none_or(|extension| extension != "harness")
            {
                return Err("복구본 경로가 올바르지 않습니다.".into());
            }
            Ok(target)
        })
        .collect::<Result<Vec<_>, String>>()?;
    for target in targets {
        std::fs::remove_file(target).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod recovery_tests {
    use super::delete_recovery_files;
    use std::fs;

    #[test]
    fn deletes_all_valid_recovery_files() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("recovery");
        fs::create_dir(&root).unwrap();
        let first = root.join("first.harness");
        let second = root.join("second.harness");
        fs::write(&first, b"first").unwrap();
        fs::write(&second, b"second").unwrap();
        let root = root.canonicalize().unwrap();

        delete_recovery_files(
            &root,
            &[
                first.to_string_lossy().to_string(),
                second.to_string_lossy().to_string(),
            ],
        )
        .unwrap();

        assert!(!first.exists());
        assert!(!second.exists());
    }

    #[test]
    fn validates_every_path_before_deleting_any_file() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("recovery");
        fs::create_dir(&root).unwrap();
        let valid = root.join("valid.harness");
        let outside = directory.path().join("outside.harness");
        fs::write(&valid, b"valid").unwrap();
        fs::write(&outside, b"outside").unwrap();
        let root = root.canonicalize().unwrap();

        let result = delete_recovery_files(
            &root,
            &[
                valid.to_string_lossy().to_string(),
                outside.to_string_lossy().to_string(),
            ],
        );

        assert!(result.is_err());
        assert!(valid.exists());
        assert!(outside.exists());
    }
}

#[tauri::command]
fn delete_recovery_snapshots(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    let root = app_data_path(&app)?
        .join("recovery")
        .canonicalize()
        .map_err(|error| error.to_string())?;
    delete_recovery_files(&root, &paths)
}

#[tauri::command]
fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|error| error.to_string())
}

fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("unix:{seconds}")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ProjectSessionManager::default())
        .setup(|app| {
            prepare_library(app.handle()).map_err(std::io::Error::other)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_project,
            get_session,
            replace_project,
            undo_project,
            redo_project,
            open_project,
            save_project,
            close_project,
            read_text_file,
            write_text_file,
            write_binary_file,
            export_xlsx,
            export_solidworks_routing_package,
            list_library_parts,
            upsert_library_part,
            get_library_model_asset,
            upsert_library_model_asset,
            get_library_symbol_asset,
            upsert_library_symbol_asset,
            read_binary_file,
            get_library_status,
            set_library_directory,
            export_library_database,
            import_library_database,
            set_library_backup_retention,
            check_library_integrity,
            save_recovery_snapshot,
            list_recovery_snapshots,
            open_recovery_snapshot,
            delete_recovery_snapshot,
            delete_recovery_snapshots
        ])
        .run(tauri::generate_context!())
        .expect("Harness Designer 실행에 실패했습니다.");
}
