use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartSnapshot {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    pub part_number: String,
    pub manufacturer: String,
    pub description: String,
    pub revision: String,
    pub category: String,
    pub unit: String,
    pub color: Option<String>,
    pub gauge: Option<String>,
    #[serde(default)]
    pub attributes: HashMap<String, String>,
    #[serde(default)]
    pub preview: Option<PartPreview>,
    pub symbol_asset_id: Option<String>,
    #[serde(default)]
    pub model_asset_id: Option<String>,
    pub source_library_revision: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartPreview {
    pub kind: String,
    pub data_url: String,
    pub source_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolAsset {
    pub id: String,
    pub name: String,
    pub source_format: String,
    pub source_name: String,
    pub view_box: String,
    pub svg: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelMesh {
    pub name: String,
    pub color: Option<[f64; 3]>,
    pub positions: Vec<f64>,
    pub normals: Option<Vec<f64>>,
    pub indices: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelAsset {
    pub id: String,
    pub name: String,
    pub source_format: String,
    pub source_name: String,
    #[serde(default)]
    pub source_data_base64: String,
    pub meshes: Vec<ModelMesh>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinDefinition {
    pub id: String,
    pub number: String,
    pub name: String,
    pub position: Point,
    pub terminal_part_id: Option<String>,
    pub seal_part_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessNode {
    pub id: String,
    pub kind: String,
    pub reference: String,
    pub label: String,
    pub part_id: Option<String>,
    pub position: Point,
    #[serde(default)]
    pub pins: Vec<PinDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessSegment {
    pub id: String,
    pub from_node_id: String,
    pub to_node_id: String,
    pub length_mm: f64,
    pub label: String,
    #[serde(default)]
    pub cable_part_id: Option<String>,
    #[serde(default)]
    pub start_heat_shrink_part_id: Option<String>,
    #[serde(default)]
    pub end_heat_shrink_part_id: Option<String>,
    pub sleeve_part_id: Option<String>,
    pub shield_part_id: Option<String>,
    pub tape_part_id: Option<String>,
    #[serde(default)]
    pub drawing_route: Option<CableDrawingRoute>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CableDrawingRoute {
    pub offset_x: f64,
    pub offset_y: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_breakout_length: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_breakout_length: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Endpoint {
    pub node_id: String,
    pub pin_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Termination {
    pub terminal_part_id: Option<String>,
    pub seal_part_id: Option<String>,
    pub lug_part_id: Option<String>,
    pub allowance_mm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conductor {
    pub id: String,
    pub reference: String,
    pub from: Endpoint,
    pub to: Endpoint,
    pub wire_part_id: String,
    pub color: String,
    pub gauge: String,
    #[serde(default)]
    pub route_segment_ids: Vec<String>,
    pub start_termination: Termination,
    pub end_termination: Termination,
    pub adjustment_mm: f64,
    pub twist_group: Option<String>,
    pub shield_group: Option<String>,
    #[serde(default)]
    pub cable_run_id: Option<String>,
    #[serde(default)]
    pub cable_core_id: Option<String>,
    #[serde(default)]
    pub drawing_route: Option<ConductorDrawingRoute>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConductorDrawingRoute {
    pub bend_x: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessoryPlacement {
    pub id: String,
    pub part_id: String,
    pub quantity: f64,
    pub segment_id: Option<String>,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessAssembly {
    pub id: String,
    pub number: String,
    pub name: String,
    pub revision: String,
    #[serde(default)]
    pub nodes: Vec<HarnessNode>,
    #[serde(default)]
    pub segments: Vec<HarnessSegment>,
    #[serde(default)]
    pub conductors: Vec<Conductor>,
    #[serde(default)]
    pub accessories: Vec<AccessoryPlacement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSettings {
    pub unit: String,
    pub paper: String,
    pub orientation: String,
    pub output_locales: Vec<String>,
    pub image_dpi: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDocument {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub project_number: String,
    pub revision: String,
    pub created_at: String,
    pub updated_at: String,
    pub settings: DocumentSettings,
    #[serde(default)]
    pub assets: Vec<SymbolAsset>,
    #[serde(default)]
    pub model_assets: Vec<ModelAsset>,
    #[serde(default)]
    pub parts: Vec<PartSnapshot>,
    #[serde(default)]
    pub harnesses: Vec<HarnessAssembly>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub session_id: String,
    pub revision: u64,
    pub dirty: bool,
    pub read_only: bool,
    pub path: Option<String>,
    pub project: ProjectDocument,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BomExportRow {
    pub part_number: String,
    pub manufacturer: String,
    pub description: String,
    pub category: String,
    pub specification: String,
    pub unit: String,
    pub quantity: f64,
    pub harnesses: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessBomExportRow {
    pub harness_number: String,
    pub part_number: String,
    pub manufacturer: String,
    pub description: String,
    pub category: String,
    pub specification: String,
    pub unit: String,
    pub quantity: f64,
    pub harnesses: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CutExportRow {
    pub harness_number: String,
    pub reference: String,
    pub from: String,
    pub to: String,
    pub part_number: String,
    pub color: String,
    pub gauge: String,
    pub length_mm: f64,
}

#[cfg(test)]
mod tests {
    use super::{Conductor, HarnessSegment};

    #[test]
    fn conductor_drawing_route_round_trip_and_legacy_default() {
        let json = r#"{"id":"wire-1","reference":"W001","from":{"nodeId":"j1","pinId":"p1"},"to":{"nodeId":"j2","pinId":"p2"},"wirePartId":"wire-part","color":"RD","gauge":"20 AWG","routeSegmentIds":["cable-run-1"],"startTermination":{"allowanceMm":0},"endTermination":{"allowanceMm":0},"adjustmentMm":0,"twistGroup":null,"shieldGroup":null,"cableRunId":"cable-run-1","cableCoreId":"1","drawingRoute":{"bendX":412}}"#;
        let conductor: Conductor = serde_json::from_str(json).unwrap();
        assert_eq!(conductor.drawing_route.as_ref().unwrap().bend_x, 412.0);
        assert_eq!(conductor.cable_run_id.as_deref(), Some("cable-run-1"));
        assert_eq!(conductor.cable_core_id.as_deref(), Some("1"));
        assert!(serde_json::to_string(&conductor).unwrap().contains("\"drawingRoute\":{\"bendX\":412.0}"));

        let legacy = json
            .replace(",\"cableRunId\":\"cable-run-1\",\"cableCoreId\":\"1\"", "")
            .replace(",\"drawingRoute\":{\"bendX\":412}", "");
        let legacy_conductor: Conductor = serde_json::from_str(&legacy).unwrap();
        assert!(legacy_conductor.drawing_route.is_none());
        assert!(legacy_conductor.cable_run_id.is_none());
        assert!(legacy_conductor.cable_core_id.is_none());
    }

    #[test]
    fn cable_drawing_route_round_trip_and_legacy_default() {
        let json = r#"{"id":"segment-1","fromNodeId":"j1","toNodeId":"j2","lengthMm":300,"label":"CBL-001","cablePartId":"cable-part","sleevePartId":null,"shieldPartId":null,"tapePartId":null,"drawingRoute":{"offsetX":20,"offsetY":80,"sourceBreakoutLength":40,"targetBreakoutLength":60}}"#;
        let segment: HarnessSegment = serde_json::from_str(json).unwrap();
        let route = segment.drawing_route.as_ref().unwrap();
        assert_eq!(route.offset_x, 20.0);
        assert_eq!(route.offset_y, 80.0);
        assert_eq!(route.source_breakout_length, Some(40.0));
        assert_eq!(route.target_breakout_length, Some(60.0));
        assert!(serde_json::to_string(&segment).unwrap().contains("\"sourceBreakoutLength\":40.0,\"targetBreakoutLength\":60.0"));

        let legacy = json.replace(",\"drawingRoute\":{\"offsetX\":20,\"offsetY\":80,\"sourceBreakoutLength\":40,\"targetBreakoutLength\":60}", "");
        let legacy_segment: HarnessSegment = serde_json::from_str(&legacy).unwrap();
        assert!(legacy_segment.drawing_route.is_none());
    }
}
