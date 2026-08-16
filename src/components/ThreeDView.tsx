import { Box, Focus, MousePointer2, Waves } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { HarnessAssembly, ModelAsset, ModelMesh, ProjectDocument } from "../domain/types";
import { useProjectStore } from "../store/projectStore";
import { getCableRenderSpec, getCableSpans, getCoreOffsets, getHeatShrinkRenderSpec, getHeatShrinkSpan, type CoreOffset } from "../three/cableRendering";
import { getCompactCoilLayout, layoutHarnessNodes } from "../three/harnessLayout";
import { defaultModelPlacement, getModelPlacement, type ModelCableAxis, type ModelPlacement } from "../three/modelPlacement";
import { PanelHeader } from "./common";
import type { AppPreferences } from "../preferences";

const qualitySpec = {
  low: { radialSegments: 8, lengthStep: 16, pixelRatio: 1, shadows: false },
  medium: { radialSegments: 12, lengthStep: 8, pixelRatio: 1.5, shadows: true },
  high: { radialSegments: 20, lengthStep: 4, pixelRatio: 2, shadows: true },
} satisfies Record<AppPreferences["threeDQuality"], { radialSegments: number; lengthStep: number; pixelRatio: number; shadows: boolean }>;

interface SceneRuntime {
  camera: THREE.PerspectiveCamera;
  content: THREE.Group;
  controls: OrbitControls;
  renderer: THREE.WebGLRenderer;
  resize: ResizeObserver;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
      return;
    }
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Line)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.dispose();
    }
  });
}

function meshGeometry(mesh: ModelMesh) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
  if (mesh.normals?.length === mesh.positions.length) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normals, 3));
  else geometry.computeVertexNormals();
  geometry.setIndex(mesh.indices);
  return geometry;
}

function modelGroup(asset: ModelAsset, selected: boolean, targetSize?: number, scaleMultiplier = 1) {
  const group = new THREE.Group();
  for (const mesh of asset.meshes) {
    const color = selected ? new THREE.Color(0x28a9e0) : mesh.color ? new THREE.Color(...mesh.color) : new THREE.Color(0x8aa1b4);
    const material = new THREE.MeshStandardMaterial({ color, metalness: 0.08, roughness: 0.68 });
    const object = new THREE.Mesh(meshGeometry(mesh), material);
    object.castShadow = true;
    object.receiveShadow = true;
    group.add(object);
  }
  const bounds = new THREE.Box3().setFromObject(group);
  if (!bounds.isEmpty()) {
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = (targetSize ? targetSize / Math.max(size.x, size.y, size.z, 0.001) : 1) * scaleMultiplier;
    group.scale.setScalar(scale);
    group.position.copy(center.multiplyScalar(-scale));
  }
  return group;
}

function cableAxisVector(axis: ModelCableAxis): THREE.Vector3 {
  if (axis === "+x") return new THREE.Vector3(1, 0, 0);
  if (axis === "-x") return new THREE.Vector3(-1, 0, 0);
  if (axis === "+y") return new THREE.Vector3(0, 1, 0);
  if (axis === "-y") return new THREE.Vector3(0, -1, 0);
  if (axis === "-z") return new THREE.Vector3(0, 0, -1);
  return new THREE.Vector3(0, 0, 1);
}

function placeConnectorVisual(visual: THREE.Object3D, placement: ModelPlacement, cableDirection: THREE.Vector3) {
  const direction = cableDirection.clone().normalize();
  const localAxis = cableAxisVector(placement.cableAxis);
  const bounds = new THREE.Box3().setFromObject(visual, true);
  const size = bounds.getSize(new THREE.Vector3());
  const halfExtent = Math.abs(localAxis.x) * size.x / 2 + Math.abs(localAxis.y) * size.y / 2 + Math.abs(localAxis.z) * size.z / 2;
  const anchor = localAxis.multiplyScalar(halfExtent).add(new THREE.Vector3(placement.offsetX, placement.offsetY, placement.offsetZ));
  visual.position.sub(anchor);
  const root = new THREE.Group();
  const alignment = new THREE.Quaternion().setFromUnitVectors(cableAxisVector(placement.cableAxis), direction);
  const roll = new THREE.Quaternion().setFromAxisAngle(direction, THREE.MathUtils.degToRad(placement.rollDeg));
  root.quaternion.copy(roll.multiply(alignment));
  root.add(visual);
  return root;
}

function placeholderNode(kind: string, selected: boolean, quality: AppPreferences["threeDQuality"]) {
  const color = selected ? 0x28a9e0 : kind === "connector" ? 0x5f7890 : 0xcf8532;
  const geometry = kind === "connector" ? new THREE.BoxGeometry(14, 8, 10) : new THREE.SphereGeometry(4.5, qualitySpec[quality].radialSegments, Math.max(6, qualitySpec[quality].radialSegments / 2));
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, metalness: 0.04, roughness: 0.74 }));
}

function labelSprite(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgba(16, 36, 52, 0.88)";
  context.roundRect(2, 2, 252, 60, 8);
  context.fill();
  context.fillStyle = "white";
  context.font = "600 25px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 128, 32);
  const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(16, 4, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function fitCamera(runtime: SceneRuntime) {
  const bounds = new THREE.Box3().setFromObject(runtime.content);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const distance = Math.max(size.x, size.y, size.z, 20) * 1.5;
  runtime.camera.position.set(center.x + distance * 0.65, center.y + distance * 0.8, center.z + distance * 0.75);
  runtime.camera.near = Math.max(distance / 1000, 0.01);
  runtime.camera.far = distance * 20;
  runtime.camera.updateProjectionMatrix();
  runtime.controls.target.copy(center);
  runtime.controls.update();
}

function wireColor(color: string) {
  const codes: Record<string, number> = {
    BK: 0x1d242b, WH: 0xf2f3f4, RD: 0xd94141, BU: 0x2784c7, GN: 0x36a269,
    YE: 0xe4c338, OR: 0xe9852f, BN: 0x7a4a2b, VT: 0x8355a5, GY: 0x78838c, PK: 0xe47ca7,
  };
  const normalized = color.trim().toUpperCase();
  if (codes[normalized] !== undefined) return codes[normalized];
  if (/^#[0-9A-F]{6}$/i.test(normalized)) return Number.parseInt(normalized.slice(1), 16);
  return 0x8aa1b4;
}

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, color: number) {
  const direction = end.clone().sub(start);
  if (direction.lengthSq() < 0.000001) return null;
  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 16),
    new THREE.MeshStandardMaterial({ color, roughness: 0.78 }),
  );
  cylinder.position.copy(start).add(end).multiplyScalar(0.5);
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  cylinder.castShadow = true;
  return cylinder;
}

function segmentCurve(start: THREE.Vector3, end: THREE.Vector3, cableLengthMm: number) {
  const axis = end.clone().sub(start);
  const displayLength = axis.length();
  const coil = getCompactCoilLayout(cableLengthMm, displayLength);
  if (!coil) return new THREE.LineCurve3(start, end);
  const direction = axis.clone().normalize();
  const reference = Math.abs(direction.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const basisX = new THREE.Vector3().crossVectors(direction, reference).normalize();
  const basisY = new THREE.Vector3().crossVectors(direction, basisX).normalize();
  const { turns, radiusMm: radius } = coil;
  const samples = Math.max(48, turns * 24);
  const points = Array.from({ length: samples + 1 }, (_, index) => {
    const ratio = index / samples;
    const angle = ratio * turns * Math.PI * 2;
    return start.clone().lerp(end, ratio)
      .addScaledVector(basisX, radius * (Math.cos(angle) - 1))
      .addScaledVector(basisY, radius * Math.sin(angle));
  });
  return new THREE.CatmullRomCurve3(points, false, "centripetal");
}

function tubeAlongCurve(curve: THREE.Curve<THREE.Vector3>, startMm: number, endMm: number, totalLengthMm: number, radius: number, color: number, quality: AppPreferences["threeDQuality"], offset?: CoreOffset, offsetStart = 1, offsetEnd = 1) {
  if (endMm - startMm < 0.001 || totalLengthMm <= 0) return null;
  const spec = qualitySpec[quality];
  const segmentCount = Math.max(8, Math.min(384, Math.ceil((endMm - startMm) / spec.lengthStep)));
  const first = curve.getPointAt(0);
  const last = curve.getPointAt(1);
  const axis = last.clone().sub(first).normalize();
  const reference = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const basisX = new THREE.Vector3().crossVectors(axis, reference).normalize();
  const basisY = new THREE.Vector3().crossVectors(axis, basisX).normalize();
  const points = Array.from({ length: segmentCount + 1 }, (_, index) => {
    const localRatio = index / segmentCount;
    const pathRatio = (startMm + (endMm - startMm) * localRatio) / totalLengthMm;
    const point = curve.getPointAt(Math.min(Math.max(pathRatio, 0), 1));
    if (offset) {
      const scale = offsetStart + (offsetEnd - offsetStart) * localRatio;
      point.addScaledVector(basisX, offset.x * scale).addScaledVector(basisY, offset.y * scale);
    }
    return point;
  });
  const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, "centripetal"), segmentCount, radius, spec.radialSegments, false);
  const tube = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.78 }));
  tube.castShadow = true;
  return tube;
}

function addSegmentVisual(runtime: SceneRuntime, project: ProjectDocument, harness: HarnessAssembly, segment: HarnessAssembly["segments"][number], start: THREE.Vector3, end: THREE.Vector3, selected: boolean, quality: AppPreferences["threeDQuality"]) {
  const cablePart = project.parts.find((part) => part.id === segment.cablePartId);
  const spec = getCableRenderSpec(cablePart);
  const conductors = harness.conductors.filter((conductor) => conductor.routeSegmentIds.includes(segment.id));
  const group = new THREE.Group();
  group.userData.segmentId = segment.id;
  const curve = segmentCurve(start, end, segment.lengthMm);
  if (!spec) {
    const cable = tubeAlongCurve(curve, 0, segment.lengthMm, segment.lengthMm, 1.15, selected ? 0xf0a53b : 0x263f54, quality);
    if (cable) group.add(cable);
    runtime.content.add(group);
    return;
  }

  const lengthMm = segment.lengthMm;
  if (lengthMm <= 0) return;
  if (!conductors.length) {
    const jacket = tubeAlongCurve(curve, 0, lengthMm, lengthMm, spec.outerDiameterMm / 2, selected ? 0xf0a53b : wireColor(spec.jacketColor), quality);
    if (jacket) group.add(jacket);
    runtime.content.add(group);
    return;
  }

  const { breakoutMm } = getCableSpans(lengthMm, spec.breakoutLengthMm);
  const jacket = tubeAlongCurve(curve, breakoutMm, lengthMm - breakoutMm, lengthMm, spec.outerDiameterMm / 2, selected ? 0xf0a53b : wireColor(spec.jacketColor), quality);
  if (jacket) group.add(jacket);

  const offsets = getCoreOffsets(conductors.length, spec.outerDiameterMm, spec.coreDiameterMm);
  conductors.forEach((conductor, index) => {
    const coreStart = tubeAlongCurve(curve, 0, breakoutMm, lengthMm, spec.coreDiameterMm / 2, wireColor(conductor.color), quality, offsets[index], 0, 1);
    const coreEnd = tubeAlongCurve(curve, lengthMm - breakoutMm, lengthMm, lengthMm, spec.coreDiameterMm / 2, wireColor(conductor.color), quality, offsets[index], 1, 0);
    if (coreStart) group.add(coreStart);
    if (coreEnd) group.add(coreEnd);
  });

  const heatShrinks = [
    { partId: segment.startHeatShrinkPartId, centerMm: breakoutMm },
    { partId: segment.endHeatShrinkPartId, centerMm: lengthMm - breakoutMm },
  ];
  for (const heatShrink of heatShrinks) {
    const heatShrinkPart = project.parts.find((part) => part.id === heatShrink.partId);
    const heatShrinkSpec = getHeatShrinkRenderSpec(heatShrinkPart);
    if (!heatShrinkSpec) continue;
    const span = getHeatShrinkSpan(lengthMm, heatShrink.centerMm, heatShrinkSpec.lengthMm);
    const tube = tubeAlongCurve(curve, span.startMm, span.endMm, lengthMm, heatShrinkSpec.finishedDiameterMm / 2, wireColor(heatShrinkSpec.color), quality);
    if (tube) group.add(tube);
  }
  runtime.content.add(group);
}

function useThreeScene(quality: AppPreferences["threeDQuality"], onSelect?: (nodeId: string) => void) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe9eef3);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, qualitySpec[quality].pixelRatio));
    renderer.shadowMap.enabled = qualitySpec[quality].shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    const content = new THREE.Group();
    scene.add(content, new THREE.HemisphereLight(0xffffff, 0x657383, 2.2));
    const light = new THREE.DirectionalLight(0xffffff, 2.4);
    light.position.set(80, 120, 70);
    light.castShadow = true;
    scene.add(light);
    const grid = new THREE.GridHelper(2000, 100, 0x8fa2b2, 0xc4cfd8);
    grid.material.opacity = 0.45;
    grid.material.transparent = true;
    scene.add(grid);
    const resize = new ResizeObserver(() => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resize.observe(host);
    const runtime = { camera, content, controls, renderer, resize };
    runtimeRef.current = runtime;
    let pointer = { x: 0, y: 0 };
    const pointerDown = (event: PointerEvent) => { pointer = { x: event.clientX, y: event.clientY }; };
    const pointerUp = (event: PointerEvent) => {
      if (!selectRef.current || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 4) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(content.children, true);
      let target: THREE.Object3D | null = hits[0]?.object ?? null;
      while (target && !target.userData.nodeId) target = target.parent;
      if (target?.userData.nodeId) selectRef.current(target.userData.nodeId);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => {
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      resize.disconnect();
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, [quality]);
  return { hostRef, runtimeRef };
}

function buildHarness(runtime: SceneRuntime, project: ProjectDocument, harness: HarnessAssembly, selectedEntityId: string | null, compactLayout: boolean, quality: AppPreferences["threeDQuality"]) {
  disposeObject(runtime.content);
  runtime.content.clear();
  const positions = new Map(Array.from(layoutHarnessNodes(harness, compactLayout ? 180 : undefined), ([id, position]) => [id, new THREE.Vector3(position.x, position.y, position.z)]));
  for (const segment of harness.segments) {
    const start = positions.get(segment.fromNodeId);
    const end = positions.get(segment.toNodeId);
    if (!start || !end) continue;
    addSegmentVisual(runtime, project, harness, segment, start, end, selectedEntityId === segment.id, quality);
  }
  for (const node of harness.nodes) {
    const group = new THREE.Group();
    group.userData.nodeId = node.id;
    group.position.copy(positions.get(node.id)!);
    const part = project.parts.find((item) => item.id === node.partId);
    const asset = project.modelAssets.find((item) => item.id === part?.modelAssetId);
    const placement = asset ? getModelPlacement(part) : defaultModelPlacement;
    const visual = asset ? modelGroup(asset, selectedEntityId === node.id, undefined, placement.scale) : placeholderNode(node.kind, selectedEntityId === node.id, quality);
    if (node.kind === "connector") {
      const adjacentPositions = harness.segments.flatMap((segment) => {
        const otherId = segment.fromNodeId === node.id ? segment.toNodeId : segment.toNodeId === node.id ? segment.fromNodeId : null;
        const other = otherId ? positions.get(otherId) : null;
        return other ? [other] : [];
      });
      const direction = adjacentPositions.reduce((sum, position) => sum.add(position.clone().sub(group.position).normalize()), new THREE.Vector3());
      if (direction.lengthSq() < 0.001) direction.set(0, 0, 1);
      else direction.normalize();
      group.add(placeConnectorVisual(visual, placement, direction));
    } else {
      group.add(visual);
    }
    const label = labelSprite(`${node.reference} · ${part?.partNumber ?? node.label}`);
    label.position.set(0, 11, 0);
    group.add(label);
    runtime.content.add(group);
  }
  fitCamera(runtime);
}

export function Harness3DView() {
  const { snapshot, activeHarnessId, selectedEntityId, selectEntity, preferences } = useProjectStore();
  const [compactLayout, setCompactLayout] = useState(true);
  const { hostRef, runtimeRef } = useThreeScene(preferences.threeDQuality, (nodeId) => selectEntity(nodeId, "node"));
  const harness = snapshot?.project.harnesses.find((item) => item.id === activeHarnessId);
  useEffect(() => {
    if (runtimeRef.current && snapshot && harness) buildHarness(runtimeRef.current, snapshot.project, harness, selectedEntityId, compactLayout, preferences.threeDQuality);
  }, [snapshot?.revision, harness?.id, selectedEntityId, compactLayout, preferences.threeDQuality]);
  if (!snapshot || !harness) return <div className="canvas-empty"><Box size={36} /><span>3D로 표시할 하네스를 선택하세요.</span></div>;
  return <div className="harness-3d-view"><PanelHeader title={`3D HARNESS · ${harness.number}`} icon={<Box size={14} />} /><div className="three-toolbar"><span><MousePointer2 size={12} />부품 선택</span><span>좌클릭 회전 · 우클릭 이동 · 휠 확대</span><button className={compactLayout ? "active" : ""} onClick={() => setCompactLayout((current) => !current)}><Waves size={12} />{compactLayout ? "컴팩트 배치" : "실제 길이"}</button><button onClick={() => runtimeRef.current && fitCamera(runtimeRef.current)}><Focus size={12} />전체 보기</button></div><div className="three-viewport" ref={hostRef} /></div>;
}

export function Part3DPreview({ asset, placement, showCable = false }: { asset: ModelAsset | null; placement?: ModelPlacement; showCable?: boolean }) {
  const quality = useProjectStore((state) => state.preferences.threeDQuality);
  const { hostRef, runtimeRef } = useThreeScene(quality);
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    disposeObject(runtime.content);
    runtime.content.clear();
    if (asset) {
      if (showCable) {
        const resolvedPlacement = placement ?? defaultModelPlacement;
        runtime.content.add(placeConnectorVisual(modelGroup(asset, false, undefined, resolvedPlacement.scale), resolvedPlacement, new THREE.Vector3(0, 0, 1)));
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 30, 16), new THREE.MeshStandardMaterial({ color: 0x263f54, roughness: 0.78 }));
        cable.position.set(0, 0, 15);
        cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
        runtime.content.add(cable, new THREE.AxesHelper(12));
      } else {
        runtime.content.add(modelGroup(asset, false, 40));
      }
      fitCamera(runtime);
    }
  }, [asset, placement, showCable]);
  return <div className="part-3d-preview" ref={hostRef}>{!asset && <span>STEP 파일을 선택하면 3D 형상이 표시됩니다.</span>}</div>;
}
