use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettingsFile {
    library_directory: Option<String>,
    #[serde(default = "default_library_backup_retention")]
    library_backup_retention: usize,
}

fn default_library_backup_retention() -> usize {
    5
}

impl Default for AppSettingsFile {
    fn default() -> Self {
        Self {
            library_directory: None,
            library_backup_retention: default_library_backup_retention(),
        }
    }
}

pub fn library_path(app_data: &Path) -> Result<PathBuf, String> {
    let settings = read(&app_data.join("app-settings.json"))?;
    Ok(settings
        .library_directory
        .map(PathBuf::from)
        .unwrap_or_else(|| app_data.to_path_buf())
        .join("parts.db"))
}

pub fn set_library_directory(app_data: &Path, directory: &Path) -> Result<PathBuf, String> {
    if !directory.is_dir() {
        return Err("선택한 라이브러리 폴더가 존재하지 않습니다.".into());
    }
    let path = app_data.join("app-settings.json");
    write(
        &path,
        &AppSettingsFile {
            library_directory: Some(directory.to_string_lossy().to_string()),
            library_backup_retention: read(&path)?.library_backup_retention,
        },
    )?;
    Ok(directory.join("parts.db"))
}

pub fn library_backup_retention(app_data: &Path) -> Result<usize, String> {
    Ok(read(&app_data.join("app-settings.json"))?.library_backup_retention)
}

pub fn set_library_backup_retention(app_data: &Path, retention: usize) -> Result<(), String> {
    let path = app_data.join("app-settings.json");
    let mut settings = read(&path)?;
    settings.library_backup_retention = retention.min(100);
    write(&path, &settings)
}

fn read(path: &Path) -> Result<AppSettingsFile, String> {
    if !path.exists() {
        return Ok(AppSettingsFile::default());
    }
    let json = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&json).map_err(|error| format!("앱 설정 파일을 읽을 수 없습니다: {error}"))
}

fn write(path: &Path, settings: &AppSettingsFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temporary = path.with_extension("json.tmp");
    std::fs::write(
        &temporary,
        serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    let backup = path.with_extension("json.backup");
    if path.exists() {
        std::fs::rename(path, &backup).map_err(|error| error.to_string())?;
    }
    if let Err(error) = std::fs::rename(&temporary, path) {
        if backup.exists() {
            let _ = std::fs::rename(&backup, path);
        }
        return Err(error.to_string());
    }
    if backup.exists() {
        let _ = std::fs::remove_file(backup);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_library_directory_round_trip() {
        let app_data = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        let selected = set_library_directory(app_data.path(), library.path()).unwrap();
        assert_eq!(selected, library.path().join("parts.db"));
        assert_eq!(library_path(app_data.path()).unwrap(), selected);
    }
}
