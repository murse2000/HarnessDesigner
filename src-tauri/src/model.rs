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
pub struct Point3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
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
    #[serde(default)]
    pub three_d_connection_offset: Option<Point3>,
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
    pub three_d_position: Option<Point3>,
    #[serde(default)]
    pub three_d_rotation: Option<Point3>,
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
    pub bend_radius_mm: Option<f64>,
    #[serde(default)]
    pub drawing_route: Option<CableDrawingRoute>,
    #[serde(default)]
    pub three_d_route: Option<ThreeDRoute>,
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
pub struct ThreeDRoute {
    #[serde(default)]
    pub control_points: Vec<ThreeDRoutePoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreeDRoutePoint {
    pub t: f64,
    pub offset_x: f64,
    pub offset_y: f64,
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
    #[serde(default)]
    pub strip_length_mm: Option<f64>,
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
    pub notes: Option<String>,
    #[serde(default)]
    pub current_a: Option<f64>,
    #[serde(default)]
    pub voltage_v: Option<f64>,
    #[serde(default)]
    pub override_length_mm: Option<f64>,
    #[serde(default)]
    pub drawing_route: Option<ConductorDrawingRoute>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManufacturingRules {
    pub bundle_packing_factor: f64,
    pub max_bundle_fill_percent: f64,
    pub min_bend_radius_multiplier: f64,
    pub max_voltage_drop_percent: f64,
    pub require_unused_cavity_seal: bool,
    #[serde(default = "default_currency")]
    pub currency: String,
    #[serde(default)]
    pub labor_rate_per_hour: f64,
    #[serde(default)]
    pub overhead_percent: f64,
}

fn default_currency() -> String {
    "KRW".into()
}

impl Default for ManufacturingRules {
    fn default() -> Self {
        Self {
            bundle_packing_factor: 0.7,
            max_bundle_fill_percent: 80.0,
            min_bend_radius_multiplier: 6.0,
            max_voltage_drop_percent: 3.0,
            require_unused_cavity_seal: false,
            currency: "KRW".into(),
            labor_rate_per_hour: 0.0,
            overhead_percent: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkInstruction {
    pub id: String,
    pub harness_id: String,
    pub sequence: u32,
    pub kind: String,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub estimated_minutes: f64,
    #[serde(default)]
    pub part_id: Option<String>,
    #[serde(default)]
    pub image_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquipmentProfile {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub delimiter: String,
    pub include_header: bool,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessVariant {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub disabled_conductor_ids: Vec<String>,
    #[serde(default)]
    pub disabled_accessory_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemHarnessInstance {
    pub id: String,
    pub harness_id: String,
    pub reference: String,
    pub quantity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemAssembly {
    pub id: String,
    pub name: String,
    pub reference: String,
    #[serde(default)]
    pub harness_instances: Vec<SystemHarnessInstance>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMember {
    pub id: String,
    pub name: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewComment {
    pub id: String,
    #[serde(default)]
    pub harness_id: Option<String>,
    #[serde(default)]
    pub entity_id: Option<String>,
    pub author: String,
    pub message: String,
    pub created_at: String,
    #[serde(default)]
    pub resolved_at: Option<String>,
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
    #[serde(default)]
    pub segment_id: Option<String>,
    #[serde(default)]
    pub node_id: Option<String>,
    #[serde(default)]
    pub drawing_position: Option<Point>,
    #[serde(default)]
    pub drawing_width: Option<f64>,
    #[serde(default)]
    pub drawing_height: Option<f64>,
    #[serde(default)]
    pub three_d_offset: Option<Point3>,
    #[serde(default)]
    pub three_d_rotation: Option<Point3>,
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
    pub release_status: Option<String>,
    #[serde(default)]
    pub nodes: Vec<HarnessNode>,
    #[serde(default)]
    pub segments: Vec<HarnessSegment>,
    #[serde(default)]
    pub conductors: Vec<Conductor>,
    #[serde(default)]
    pub accessories: Vec<AccessoryPlacement>,
    #[serde(default)]
    pub drawing_notes: String,
    #[serde(default)]
    pub drawing_table_offsets: HashMap<String, Point>,
    #[serde(default)]
    pub drawing_annotations: Vec<DrawingAnnotation>,
    #[serde(default)]
    pub formboard: Option<FormboardLayoutState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormboardLayoutState {
    #[serde(default)]
    pub node_positions: HashMap<String, Point>,
    #[serde(default)]
    pub segment_routes: HashMap<String, Vec<Point>>,
    #[serde(default)]
    pub fixtures: Vec<FormboardFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormboardFixture {
    pub id: String,
    pub kind: String,
    pub position: Point,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawingAnnotation {
    pub id: String,
    pub kind: String,
    pub text: String,
    pub position: Point,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub image_data_url: Option<String>,
    #[serde(default)]
    pub z_index: Option<i32>,
    #[serde(default)]
    pub flipped_x: Option<bool>,
    #[serde(default)]
    pub flipped_y: Option<bool>,
    #[serde(default)]
    pub fill_color: Option<String>,
    #[serde(default)]
    pub stroke_color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessReleaseRecord {
    pub id: String,
    pub harness_id: String,
    pub revision: String,
    pub released_at: String,
    pub released_by: String,
    pub note: String,
    pub fingerprint: String,
    pub snapshot: HarnessAssembly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinuityTestExecutionRow {
    pub conductor_id: String,
    pub harness_id: String,
    pub harness_number: String,
    pub reference: String,
    pub from_connector: String,
    pub from_pin: String,
    pub to_connector: String,
    pub to_pin: String,
    pub color: String,
    pub gauge: String,
    pub cable_core: String,
    pub expected: String,
    pub result: String,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessTestRun {
    pub id: String,
    pub harness_id: String,
    pub harness_number: String,
    pub revision: String,
    pub serial_number: String,
    pub operator: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub rows: Vec<ContinuityTestExecutionRow>,
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
    #[serde(default)]
    pub release_history: Vec<HarnessReleaseRecord>,
    #[serde(default)]
    pub test_runs: Vec<HarnessTestRun>,
    #[serde(default)]
    pub manufacturing_rules: ManufacturingRules,
    #[serde(default)]
    pub work_instructions: Vec<WorkInstruction>,
    #[serde(default)]
    pub equipment_profiles: Vec<EquipmentProfile>,
    #[serde(default)]
    pub variants: Vec<HarnessVariant>,
    #[serde(default)]
    pub systems: Vec<SystemAssembly>,
    #[serde(default)]
    pub members: Vec<ProjectMember>,
    #[serde(default)]
    pub review_comments: Vec<ReviewComment>,
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
    #[serde(default)]
    pub start_strip_length_mm: Option<f64>,
    #[serde(default)]
    pub end_strip_length_mm: Option<f64>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinuityTestExportRow {
    pub harness_number: String,
    pub reference: String,
    pub from_connector: String,
    pub from_pin: String,
    pub to_connector: String,
    pub to_pin: String,
    pub color: String,
    pub gauge: String,
    pub cable_core: String,
    pub expected: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinuityTestResultExportRow {
    pub harness_number: String,
    pub revision: String,
    pub serial_number: String,
    pub operator: String,
    pub started_at: String,
    pub completed_at: String,
    pub reference: String,
    pub from_connector: String,
    pub from_pin: String,
    pub to_connector: String,
    pub to_pin: String,
    pub expected: String,
    pub result: String,
    pub note: String,
}

#[cfg(test)]
mod tests {
    use super::{
        AccessoryPlacement, Conductor, HarnessAssembly, HarnessNode, HarnessSegment, PinDefinition,
    };

    #[test]
    fn pin_three_d_connection_offset_round_trip_and_legacy_default() {
        let json = r#"{"id":"p1","number":"1","name":"VCC","position":{"x":0,"y":0},"threeDConnectionOffset":{"x":5,"y":2,"z":-1},"terminalPartId":null,"sealPartId":null}"#;
        let pin: PinDefinition = serde_json::from_str(json).unwrap();
        assert_eq!(pin.three_d_connection_offset.as_ref().unwrap().x, 5.0);
        assert!(serde_json::to_string(&pin)
            .unwrap()
            .contains("\"threeDConnectionOffset\":{\"x\":5.0,\"y\":2.0,\"z\":-1.0}"));

        let legacy: PinDefinition = serde_json::from_str(
            &json.replace(",\"threeDConnectionOffset\":{\"x\":5,\"y\":2,\"z\":-1}", ""),
        )
        .unwrap();
        assert!(legacy.three_d_connection_offset.is_none());
    }

    #[test]
    fn harness_node_three_d_position_round_trip_and_legacy_default() {
        let json = r#"{"id":"j1","kind":"connector","reference":"J1","label":"MAIN","partId":null,"position":{"x":100,"y":200},"threeDPosition":{"x":125,"y":45,"z":-80},"threeDRotation":{"x":15,"y":30,"z":45},"pins":[]}"#;
        let node: HarnessNode = serde_json::from_str(json).unwrap();
        assert_eq!(node.three_d_position.as_ref().unwrap().z, -80.0);
        assert_eq!(node.three_d_rotation.as_ref().unwrap().y, 30.0);
        assert!(serde_json::to_string(&node)
            .unwrap()
            .contains("\"threeDRotation\":{\"x\":15.0,\"y\":30.0,\"z\":45.0}"));

        let legacy: HarnessNode = serde_json::from_str(
            &json.replace(",\"threeDRotation\":{\"x\":15,\"y\":30,\"z\":45}", ""),
        )
        .unwrap();
        assert!(legacy.three_d_rotation.is_none());
    }

    #[test]
    fn accessory_three_d_offset_round_trip_and_legacy_default() {
        let json = r#"{"id":"label-1","partId":"label","quantity":1,"threeDOffset":{"x":12,"y":-4,"z":8},"threeDRotation":{"x":0,"y":90,"z":0},"note":""}"#;
        let accessory: AccessoryPlacement = serde_json::from_str(json).unwrap();
        assert_eq!(accessory.three_d_offset.as_ref().unwrap().x, 12.0);
        assert_eq!(accessory.three_d_rotation.as_ref().unwrap().y, 90.0);

        let legacy: AccessoryPlacement = serde_json::from_str(
            &json.replace(",\"threeDRotation\":{\"x\":0,\"y\":90,\"z\":0}", ""),
        )
        .unwrap();
        assert!(legacy.three_d_rotation.is_none());
    }

    #[test]
    fn harness_drawing_notes_round_trip_and_legacy_default() {
        let legacy = r#"{"id":"h1","number":"HNS-001","name":"Harness","revision":"A"}"#;
        let legacy_harness: HarnessAssembly = serde_json::from_str(legacy).unwrap();
        assert!(legacy_harness.drawing_notes.is_empty());
        assert!(legacy_harness.drawing_table_offsets.is_empty());
        assert!(legacy_harness.drawing_annotations.is_empty());
        assert!(legacy_harness.formboard.is_none());

        let json = r#"{"id":"h1","number":"HNS-001","name":"Harness","revision":"A","drawingNotes":"체결 확인\n연속성 검사","drawingTableOffsets":{"notes":{"x":20,"y":10}},"drawingAnnotations":[{"id":"a1","kind":"label","text":"검사 완료","position":{"x":120,"y":80},"width":140,"height":36}]}"#;
        let harness: HarnessAssembly = serde_json::from_str(json).unwrap();
        assert_eq!(harness.drawing_notes, "체결 확인\n연속성 검사");
        assert_eq!(harness.drawing_table_offsets["notes"].x, 20.0);
        assert!(serde_json::to_string(&harness)
            .unwrap()
            .contains("drawingNotes"));
        assert!(serde_json::to_string(&harness)
            .unwrap()
            .contains("drawingTableOffsets"));
        assert_eq!(harness.drawing_annotations[0].text, "검사 완료");
        assert!(serde_json::to_string(&harness)
            .unwrap()
            .contains("drawingAnnotations"));
    }

    #[test]
    fn formboard_round_trip_and_legacy_default() {
        let json = r#"{"id":"h1","number":"HNS-001","name":"Harness","revision":"A","formboard":{"nodePositions":{"j1":{"x":10,"y":20}},"segmentRoutes":{"s1":[{"x":30,"y":40}]},"fixtures":[{"id":"f1","kind":"peg","position":{"x":50,"y":60},"label":"P1"}]}}"#;
        let harness: HarnessAssembly = serde_json::from_str(json).unwrap();
        let formboard = harness.formboard.as_ref().unwrap();
        assert_eq!(formboard.node_positions["j1"].x, 10.0);
        assert_eq!(formboard.segment_routes["s1"][0].y, 40.0);
        assert_eq!(formboard.fixtures[0].kind, "peg");
        assert!(serde_json::to_string(&harness)
            .unwrap()
            .contains("nodePositions"));
    }

    #[test]
    fn conductor_drawing_route_round_trip_and_legacy_default() {
        let json = r#"{"id":"wire-1","reference":"W001","from":{"nodeId":"j1","pinId":"p1"},"to":{"nodeId":"j2","pinId":"p2"},"wirePartId":"wire-part","color":"RD","gauge":"20 AWG","routeSegmentIds":["cable-run-1"],"startTermination":{"allowanceMm":0},"endTermination":{"allowanceMm":0},"adjustmentMm":0,"twistGroup":null,"shieldGroup":null,"cableRunId":"cable-run-1","cableCoreId":"1","drawingRoute":{"bendX":412}}"#;
        let conductor: Conductor = serde_json::from_str(json).unwrap();
        assert_eq!(conductor.drawing_route.as_ref().unwrap().bend_x, 412.0);
        assert_eq!(conductor.cable_run_id.as_deref(), Some("cable-run-1"));
        assert_eq!(conductor.cable_core_id.as_deref(), Some("1"));
        assert!(serde_json::to_string(&conductor)
            .unwrap()
            .contains("\"drawingRoute\":{\"bendX\":412.0}"));

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
        let json = r#"{"id":"segment-1","fromNodeId":"j1","toNodeId":"j2","lengthMm":300,"label":"CBL-001","cablePartId":"cable-part","sleevePartId":null,"shieldPartId":null,"tapePartId":null,"drawingRoute":{"offsetX":20,"offsetY":80,"sourceBreakoutLength":40,"targetBreakoutLength":60},"threeDRoute":{"controlPoints":[{"t":0.5,"offsetX":30,"offsetY":10}]}}"#;
        let segment: HarnessSegment = serde_json::from_str(json).unwrap();
        let route = segment.drawing_route.as_ref().unwrap();
        assert_eq!(route.offset_x, 20.0);
        assert_eq!(route.offset_y, 80.0);
        assert_eq!(route.source_breakout_length, Some(40.0));
        assert_eq!(route.target_breakout_length, Some(60.0));
        assert!(serde_json::to_string(&segment)
            .unwrap()
            .contains("\"sourceBreakoutLength\":40.0,\"targetBreakoutLength\":60.0"));
        assert_eq!(
            segment.three_d_route.as_ref().unwrap().control_points[0].offset_x,
            30.0
        );
        assert!(serde_json::to_string(&segment)
            .unwrap()
            .contains("\"threeDRoute\""));

        let legacy = json
            .replace(",\"drawingRoute\":{\"offsetX\":20,\"offsetY\":80,\"sourceBreakoutLength\":40,\"targetBreakoutLength\":60}", "")
            .replace(",\"threeDRoute\":{\"controlPoints\":[{\"t\":0.5,\"offsetX\":30,\"offsetY\":10}]}", "");
        let legacy_segment: HarnessSegment = serde_json::from_str(&legacy).unwrap();
        assert!(legacy_segment.drawing_route.is_none());
        assert!(legacy_segment.three_d_route.is_none());
    }
}
