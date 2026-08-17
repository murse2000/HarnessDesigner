use crate::model::{ProjectDocument, SessionSnapshot};
use parking_lot::Mutex;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

const HISTORY_LIMIT: usize = 50;

struct ProjectSession {
    id: String,
    revision: u64,
    dirty: bool,
    read_only: bool,
    path: Option<PathBuf>,
    lock_path: Option<PathBuf>,
    project: ProjectDocument,
    undo: Vec<ProjectDocument>,
    redo: Vec<ProjectDocument>,
}

impl ProjectSession {
    fn snapshot(&self) -> SessionSnapshot {
        SessionSnapshot {
            session_id: self.id.clone(),
            revision: self.revision,
            dirty: self.dirty,
            read_only: self.read_only,
            path: self
                .path
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            project: self.project.clone(),
        }
    }
}

#[derive(Default)]
pub struct ProjectSessionManager {
    sessions: Mutex<HashMap<String, ProjectSession>>,
}

impl ProjectSessionManager {
    pub fn create(&self, project: ProjectDocument) -> SessionSnapshot {
        let id = Uuid::new_v4().to_string();
        let session = ProjectSession {
            id: id.clone(),
            revision: 0,
            dirty: false,
            read_only: false,
            path: None,
            lock_path: None,
            project,
            undo: Vec::new(),
            redo: Vec::new(),
        };
        let snapshot = session.snapshot();
        self.sessions.lock().insert(id, session);
        snapshot
    }

    pub fn create_recovered(&self, project: ProjectDocument) -> SessionSnapshot {
        let mut snapshot = self.create(project);
        if let Some(session) = self.sessions.lock().get_mut(&snapshot.session_id) {
            session.dirty = true;
            snapshot = session.snapshot();
        }
        snapshot
    }

    pub fn get(&self, session_id: &str) -> Result<SessionSnapshot, String> {
        self.sessions
            .lock()
            .get(session_id)
            .map(ProjectSession::snapshot)
            .ok_or_else(|| "프로젝트 세션을 찾을 수 없습니다.".into())
    }

    pub fn find_by_path(&self, path: &Path) -> Option<SessionSnapshot> {
        let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        self.sessions
            .lock()
            .values()
            .find(|session| {
                session.path.as_ref().is_some_and(|current| {
                    current.canonicalize().unwrap_or_else(|_| current.clone()) == canonical
                })
            })
            .map(ProjectSession::snapshot)
    }

    pub fn insert_opened(
        &self,
        project: ProjectDocument,
        path: PathBuf,
        read_only: bool,
        lock_path: Option<PathBuf>,
    ) -> SessionSnapshot {
        let id = Uuid::new_v4().to_string();
        let session = ProjectSession {
            id: id.clone(),
            revision: 0,
            dirty: false,
            read_only,
            path: Some(path),
            lock_path,
            project,
            undo: Vec::new(),
            redo: Vec::new(),
        };
        let snapshot = session.snapshot();
        self.sessions.lock().insert(id, session);
        snapshot
    }

    pub fn replace(
        &self,
        app: &AppHandle,
        session_id: &str,
        project: ProjectDocument,
    ) -> Result<SessionSnapshot, String> {
        let mut sessions = self.sessions.lock();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| "프로젝트 세션을 찾을 수 없습니다.".to_string())?;
        if session.read_only {
            return Err("읽기 전용 프로젝트는 수정할 수 없습니다.".into());
        }
        let previous = std::mem::replace(&mut session.project, project);
        session.undo.push(previous);
        if session.undo.len() > HISTORY_LIMIT {
            session.undo.remove(0);
        }
        session.redo.clear();
        session.revision += 1;
        session.dirty = true;
        let snapshot = session.snapshot();
        drop(sessions);
        emit_snapshot(app, &snapshot);
        Ok(snapshot)
    }

    pub fn undo(&self, app: &AppHandle, session_id: &str) -> Result<SessionSnapshot, String> {
        let mut sessions = self.sessions.lock();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| "프로젝트 세션을 찾을 수 없습니다.".to_string())?;
        if session.read_only {
            return Err("읽기 전용 프로젝트는 수정할 수 없습니다.".into());
        }
        if let Some(previous) = session.undo.pop() {
            let current = std::mem::replace(&mut session.project, previous);
            session.redo.push(current);
            session.revision += 1;
            session.dirty = true;
        }
        let snapshot = session.snapshot();
        drop(sessions);
        emit_snapshot(app, &snapshot);
        Ok(snapshot)
    }

    pub fn redo(&self, app: &AppHandle, session_id: &str) -> Result<SessionSnapshot, String> {
        let mut sessions = self.sessions.lock();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| "프로젝트 세션을 찾을 수 없습니다.".to_string())?;
        if session.read_only {
            return Err("읽기 전용 프로젝트는 수정할 수 없습니다.".into());
        }
        if let Some(next) = session.redo.pop() {
            let current = std::mem::replace(&mut session.project, next);
            session.undo.push(current);
            session.revision += 1;
            session.dirty = true;
        }
        let snapshot = session.snapshot();
        drop(sessions);
        emit_snapshot(app, &snapshot);
        Ok(snapshot)
    }

    pub fn mark_saved(
        &self,
        app: &AppHandle,
        session_id: &str,
        path: PathBuf,
        lock_path: Option<PathBuf>,
    ) -> Result<SessionSnapshot, String> {
        let mut sessions = self.sessions.lock();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| "프로젝트 세션을 찾을 수 없습니다.".to_string())?;
        if session.path.as_ref() != Some(&path) {
            if let Some(old_lock) = session.lock_path.take() {
                let _ = fs::remove_file(old_lock);
            }
            session.lock_path = lock_path;
        }
        session.path = Some(path);
        session.dirty = false;
        let snapshot = session.snapshot();
        drop(sessions);
        emit_snapshot(app, &snapshot);
        Ok(snapshot)
    }

    pub fn close(&self, session_id: &str) -> Result<(), String> {
        let session = self
            .sessions
            .lock()
            .remove(session_id)
            .ok_or_else(|| "프로젝트 세션을 찾을 수 없습니다.".to_string())?;
        if let Some(lock_path) = session.lock_path {
            let _ = fs::remove_file(lock_path);
        }
        Ok(())
    }
}

impl Drop for ProjectSessionManager {
    fn drop(&mut self) {
        for session in self.sessions.get_mut().values() {
            if let Some(lock_path) = &session.lock_path {
                let _ = fs::remove_file(lock_path);
            }
        }
    }
}

fn emit_snapshot(app: &AppHandle, snapshot: &SessionSnapshot) {
    let _ = app.emit(
        &format!("project-changed:{}", snapshot.session_id),
        snapshot,
    );
}
