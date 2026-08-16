use crate::model::ProjectDocument;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::{fs::{self, File, OpenOptions}, io::{Read, Write}, path::{Path, PathBuf}};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Manifest<'a> {
    schema_version: u32,
    app_version: &'a str,
    project_id: &'a str,
    project_name: &'a str,
}

pub fn read_project(path: &Path) -> Result<ProjectDocument, String> {
    let file = File::open(path).map_err(|error| format!("프로젝트 파일을 열 수 없습니다: {error}"))?;
    let mut archive = ZipArchive::new(file).map_err(|error| format!("유효한 .harness 파일이 아닙니다: {error}"))?;
    let mut project: ProjectDocument = {
        let mut project_file = archive.by_name("project.json").map_err(|_| "project.json이 없습니다.".to_string())?;
        let mut json = String::new();
        project_file.read_to_string(&mut json).map_err(|error| error.to_string())?;
        serde_json::from_str(&json).map_err(|error| format!("프로젝트 데이터가 손상되었습니다: {error}"))?
    };
    if project.schema_version != 1 { return Err(format!("지원하지 않는 프로젝트 스키마입니다: {}", project.schema_version)); }
    for asset in &mut project.model_assets {
        if !asset.source_data_base64.is_empty() { continue; }
        let safe_name = safe_asset_name(&asset.id);
        let mut source = archive.by_name(&format!("assets/3d/{safe_name}.step")).map_err(|_| format!("3D 자산 원본이 없습니다: {}", asset.source_name))?;
        let mut bytes = Vec::new();
        source.read_to_end(&mut bytes).map_err(|error| error.to_string())?;
        asset.source_data_base64 = STANDARD.encode(bytes);
    }
    Ok(project)
}

pub fn write_project(path: &Path, project: &ProjectDocument) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "저장 경로가 올바르지 않습니다.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temp_path = path.with_extension("harness.tmp");
    let file = File::create(&temp_path).map_err(|error| error.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let manifest = Manifest { schema_version: 1, app_version: env!("CARGO_PKG_VERSION"), project_id: &project.id, project_name: &project.name };
    zip.start_file("manifest.json", options).map_err(|error| error.to_string())?;
    zip.write_all(serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())?.as_bytes()).map_err(|error| error.to_string())?;
    let mut project_json = project.clone();
    for asset in &mut project_json.model_assets { asset.source_data_base64.clear(); }
    zip.start_file("project.json", options).map_err(|error| error.to_string())?;
    zip.write_all(serde_json::to_string_pretty(&project_json).map_err(|error| error.to_string())?.as_bytes()).map_err(|error| error.to_string())?;
    zip.add_directory("parts/", options).map_err(|error| error.to_string())?;
    zip.add_directory("assets/", options).map_err(|error| error.to_string())?;
    for asset in &project.assets {
        let safe_name = safe_asset_name(&asset.id);
        zip.start_file(format!("assets/{safe_name}.svg"), options).map_err(|error| error.to_string())?;
        zip.write_all(asset.svg.as_bytes()).map_err(|error| error.to_string())?;
    }
    zip.add_directory("assets/3d/", options).map_err(|error| error.to_string())?;
    for asset in &project.model_assets {
        let bytes = STANDARD.decode(&asset.source_data_base64).map_err(|error| format!("3D 자산 인코딩이 손상되었습니다: {error}"))?;
        zip.start_file(format!("assets/3d/{}.step", safe_asset_name(&asset.id)), options).map_err(|error| error.to_string())?;
        zip.write_all(&bytes).map_err(|error| error.to_string())?;
    }
    zip.add_directory("locales/", options).map_err(|error| error.to_string())?;
    zip.finish().map_err(|error| error.to_string())?;
    if path.exists() {
        let backup_path = path.with_extension("harness.bak");
        let _ = fs::remove_file(&backup_path);
        fs::rename(path, &backup_path).map_err(|error| format!("기존 프로젝트 백업에 실패했습니다: {error}"))?;
        if let Err(error) = fs::rename(&temp_path, path) {
            let _ = fs::rename(&backup_path, path);
            return Err(format!("프로젝트 파일 교체에 실패했습니다: {error}"));
        }
        let _ = fs::remove_file(backup_path);
    } else {
        fs::rename(&temp_path, path).map_err(|error| format!("프로젝트 파일 교체에 실패했습니다: {error}"))?;
    }
    Ok(())
}

fn safe_asset_name(id: &str) -> String {
    id.chars().filter(|character| character.is_ascii_alphanumeric() || *character == '-' || *character == '_').collect()
}

pub fn acquire_lock(path: &Path) -> Result<(bool, Option<PathBuf>), String> {
    let lock_path = PathBuf::from(format!("{}.lock", path.to_string_lossy()));
    match OpenOptions::new().create_new(true).write(true).open(&lock_path) {
        Ok(mut file) => {
            let info = format!("pid={}\n", std::process::id());
            file.write_all(info.as_bytes()).map_err(|error| error.to_string())?;
            Ok((false, Some(lock_path)))
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok((true, None)),
        Err(error) => Err(format!("프로젝트 잠금 파일을 만들 수 없습니다: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{DocumentSettings, ModelAsset, ModelMesh, ProjectDocument, SymbolAsset};

    fn project() -> ProjectDocument {
        ProjectDocument {
            schema_version: 1,
            id: "project-test".into(),
            name: "테스트 프로젝트".into(),
            project_number: "PRJ-T01".into(),
            revision: "A".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
            settings: DocumentSettings { unit: "mm".into(), paper: "A3".into(), orientation: "landscape".into(), output_locales: vec!["ko".into(), "en".into()], image_dpi: 300 },
            assets: vec![SymbolAsset { id: "asset-1".into(), name: "Housing".into(), source_format: "svg".into(), source_name: "housing.svg".into(), view_box: "0 0 10 10".into(), svg: "<svg viewBox=\"0 0 10 10\"></svg>".into() }],
            model_assets: vec![ModelAsset { id: "model-1".into(), name: "Housing 3D".into(), source_format: "step".into(), source_name: "housing.step".into(), source_data_base64: STANDARD.encode(b"ISO-10303-21;"), meshes: vec![ModelMesh { name: "body".into(), color: None, positions: vec![0.0, 0.0, 0.0], normals: None, indices: vec![] }] }],
            parts: vec![], harnesses: vec![],
        }
    }

    #[test]
    fn harness_package_round_trip_preserves_project_and_assets() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("test.harness");
        write_project(&path, &project()).unwrap();
        let loaded = read_project(&path).unwrap();
        assert_eq!(loaded.project_number, "PRJ-T01");
        assert_eq!(loaded.assets.len(), 1);
        assert_eq!(loaded.model_assets[0].source_data_base64, STANDARD.encode(b"ISO-10303-21;"));
        let file = File::open(path).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        assert!(archive.by_name("assets/asset-1.svg").is_ok());
        assert!(archive.by_name("assets/3d/model-1.step").is_ok());
    }

    #[test]
    fn second_lock_is_read_only() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("test.harness");
        let first = acquire_lock(&path).unwrap();
        let second = acquire_lock(&path).unwrap();
        assert!(!first.0);
        assert!(second.0);
    }
}
