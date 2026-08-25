mod rebuild2d_library;

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn app_data_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn validate_rebuilt_project(project: &serde_json::Value) -> Result<(), String> {
    if project.get("documentType").and_then(serde_json::Value::as_str) != Some("harness-designer-2d") {
        return Err("새 2D 프로젝트 형식이 아닙니다.".into());
    }
    if project.get("schemaVersion").and_then(serde_json::Value::as_u64) != Some(2) {
        return Err("지원하지 않는 2D 프로젝트 스키마입니다.".into());
    }
    let harnesses = project.get("harnesses").and_then(serde_json::Value::as_array)
        .ok_or_else(|| "프로젝트 하네스 목록이 없습니다.".to_string())?;
    if harnesses.is_empty() {
        return Err("프로젝트에 하네스가 없습니다.".into());
    }
    Ok(())
}

fn write_rebuilt_project(path: &Path, project: &serde_json::Value) -> Result<(), String> {
    validate_rebuilt_project(project)?;
    let parent = path.parent().filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| "프로젝트 저장 폴더를 확인할 수 없습니다.".to_string())?;
    if !parent.is_dir() {
        return Err("프로젝트 저장 폴더가 존재하지 않습니다.".into());
    }
    let temporary_path = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name().unwrap_or_default().to_string_lossy(),
        uuid::Uuid::new_v4()
    ));
    let content = serde_json::to_vec_pretty(project).map_err(|error| error.to_string())?;
    std::fs::write(&temporary_path, content).map_err(|error| error.to_string())?;
    if let Err(error) = std::fs::rename(&temporary_path, path) {
        let _ = std::fs::remove_file(&temporary_path);
        return Err(error.to_string());
    }
    Ok(())
}

fn read_rebuilt_project(path: &Path) -> Result<serde_json::Value, String> {
    let content = std::fs::read(path).map_err(|error| error.to_string())?;
    let project = serde_json::from_slice(&content).map_err(|error| error.to_string())?;
    validate_rebuilt_project(&project)?;
    Ok(project)
}

fn write_rebuilt_binary(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path.parent().filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| "출력 파일의 저장 폴더를 확인할 수 없습니다.".to_string())?;
    if !parent.is_dir() {
        return Err("출력 파일의 저장 폴더가 존재하지 않습니다.".into());
    }
    let temporary_path = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name().unwrap_or_default().to_string_lossy(),
        uuid::Uuid::new_v4()
    ));
    std::fs::write(&temporary_path, content).map_err(|error| error.to_string())?;
    if let Err(error) = std::fs::rename(&temporary_path, path) {
        let _ = std::fs::remove_file(&temporary_path);
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
fn save_rebuilt_project(path: String, project: serde_json::Value) -> Result<(), String> {
    write_rebuilt_project(&PathBuf::from(path), &project)
}

#[tauri::command]
fn open_rebuilt_project(path: String) -> Result<serde_json::Value, String> {
    read_rebuilt_project(&PathBuf::from(path))
}

#[tauri::command]
fn write_rebuilt_binary_file(path: String, content: Vec<u8>) -> Result<(), String> {
    write_rebuilt_binary(&PathBuf::from(path), &content)
}

#[tauri::command]
fn print_rebuilt_webview(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|error| error.to_string())
}

#[tauri::command]
fn create_rebuilt_parts_library(app: AppHandle, path: String, name: String) -> Result<rebuild2d_library::LibrarySummary2d, String> {
    let path = PathBuf::from(path);
    let summary = rebuild2d_library::create(&path, &name)?;
    rebuild2d_library::set_selected_path(&app_data_path(&app)?, &path)?;
    Ok(summary)
}

#[tauri::command]
fn open_rebuilt_parts_library(app: AppHandle, path: String) -> Result<rebuild2d_library::LibrarySummary2d, String> {
    let path = PathBuf::from(path);
    let summary = rebuild2d_library::summary(&path)?;
    rebuild2d_library::set_selected_path(&app_data_path(&app)?, &path)?;
    Ok(summary)
}

#[tauri::command]
fn get_rebuilt_parts_library(app: AppHandle) -> Result<Option<rebuild2d_library::LibrarySummary2d>, String> {
    rebuild2d_library::ensure_default_library(&app_data_path(&app)?).map(|installed| Some(installed.library))
}

#[tauri::command]
fn get_rebuilt_default_library_folder(app: AppHandle) -> Result<String, String> {
    rebuild2d_library::ensure_default_library(&app_data_path(&app)?).map(|installed| installed.folder)
}

#[tauri::command]
fn set_rebuilt_default_library_folder(app: AppHandle, folder: String) -> Result<rebuild2d_library::DefaultLibraryInstallation2d, String> {
    rebuild2d_library::install_default_library(&app_data_path(&app)?, &PathBuf::from(folder))
}

#[tauri::command]
fn query_rebuilt_parts_library(app: AppHandle, query: String, category: Option<String>, offset: usize, limit: usize) -> Result<rebuild2d_library::LibraryPage2d, String> {
    let path = rebuild2d_library::selected_path(&app_data_path(&app)?)?
        .ok_or_else(|| "부품 라이브러리를 먼저 지정하세요.".to_string())?;
    rebuild2d_library::query(&path, &query, category.as_deref(), offset, limit)
}

#[tauri::command]
fn upsert_rebuilt_library_part(app: AppHandle, part: rebuild2d_library::LibraryPart2d) -> Result<rebuild2d_library::LibraryPart2d, String> {
    let path = rebuild2d_library::selected_path(&app_data_path(&app)?)?
        .ok_or_else(|| "부품 라이브러리를 먼저 지정하세요.".to_string())?;
    rebuild2d_library::upsert(&path, part)
}

#[tauri::command]
fn delete_rebuilt_library_part(app: AppHandle, part_id: String) -> Result<(), String> {
    let path = rebuild2d_library::selected_path(&app_data_path(&app)?)?
        .ok_or_else(|| "부품 라이브러리를 먼저 지정하세요.".to_string())?;
    rebuild2d_library::delete(&path, &part_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        let windows = app.webview_windows();
        let window = windows.get("main").or_else(|| windows.values().next());
        if let Some(window) = window {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_rebuilt_project,
            save_rebuilt_project,
            write_rebuilt_binary_file,
            print_rebuilt_webview,
            create_rebuilt_parts_library,
            open_rebuilt_parts_library,
            get_rebuilt_parts_library,
            get_rebuilt_default_library_folder,
            set_rebuilt_default_library_folder,
            query_rebuilt_parts_library,
            upsert_rebuilt_library_part,
            delete_rebuilt_library_part,
        ])
        .run(tauri::generate_context!())
        .expect("Harness Designer 실행에 실패했습니다.");
}

#[cfg(test)]
mod rebuilt_project_tests {
    use super::{read_rebuilt_project, write_rebuilt_binary, write_rebuilt_project};
    use serde_json::json;

    fn project() -> serde_json::Value {
        json!({
            "documentType": "harness-designer-2d",
            "schemaVersion": 2,
            "id": "project-1",
            "projectNumber": "PRJ-001",
            "name": "Test",
            "createdAt": "2026-08-22T00:00:00Z",
            "updatedAt": "2026-08-22T00:00:00Z",
            "harnesses": [{
                "id": "harness-1",
                "partNumber": "HNS-001",
                "name": "Harness",
                "revision": "A",
                "components": [],
                "connections": [],
                "cableRuns": [],
                "drawing": { "componentPlacements": {} }
            }]
        })
    }

    #[test]
    fn saves_and_reopens_the_new_2d_document() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("project.harness2d");
        let expected = project();
        write_rebuilt_project(&path, &expected).unwrap();
        assert_eq!(read_rebuilt_project(&path).unwrap(), expected);
    }

    #[test]
    fn rejects_legacy_project_data() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("legacy.harness");
        let legacy = json!({ "schemaVersion": 1, "harnesses": [{}] });
        assert!(write_rebuilt_project(&path, &legacy).is_err());
        assert!(!path.exists());
    }

    #[test]
    fn writes_binary_output_without_changing_its_bytes() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("drawing.pdf");
        let expected = b"%PDF-1.7\nHarness Designer";

        write_rebuilt_binary(&path, expected).unwrap();

        assert_eq!(std::fs::read(path).unwrap(), expected);
    }
}
