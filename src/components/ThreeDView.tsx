import { Box, BoxSelect, Crosshair, Download, Eye, EyeOff, Focus, ListTree, Move3D, MousePointer2, Plus, Rotate3D, RotateCcw, Save, ScanLine, Trash2, Waves } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { DragControls } from "three/addons/controls/DragControls.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { HarnessAssembly, ModelAsset, ModelMesh, PartSnapshot, ProjectDocument } from "../domain/types";
import { backendInvoke, isTauri } from "../platform";
import { useProjectStore } from "../store/projectStore";
import { getCableDisplayPolicy, getCableRenderSpec, getCableSpans, getCoreOffsets, getHeatShrinkRenderSpec, getHeatShrinkSpan, getIndividualWireOffsets, getWireRenderDiameterMm, type CoreOffset } from "../three/cableRendering";
import { directWireConductors, directWireLengthMm, getCompactCoilLayout, layoutHarnessNodes, positionHarnessRoutePoint, projectHarnessRoutePoint } from "../three/harnessLayout";
import { defaultModelPlacement, getModelPinPort, getModelPlacement, modelInletDirection, modelPinPortDirection, resolveLibraryModelPlacement, rotateModelPinPorts, setModelPinPort, type ModelPlacement } from "../three/modelPlacement";
import { buildCableCoreCurves, buildInletCurve, closestPinConnectionCandidate, connectorWorldDirection, getConductorPinIdAtNode, getPinConnectionPosition, pinConnectionKey, projectPinToConnectorSurface } from "../three/pinConnections";
import { buildThreeSceneItems, type ThreeSceneItem } from "../three/sceneBrowser";
import { PanelHeader } from "./common";
import type { AppPreferences, Saved3DViewpoint } from "../preferences";

const qualitySpec = {
  low: { radialSegments: 8, lengthStep: 16, pixelRatio: 1, shadows: false },
  medium: { radialSegments: 12, lengthStep: 8, pixelRatio: 1.5, shadows: true },
  high: { radialSegments: 20, lengthStep: 4, pixelRatio: 2, shadows: true },
} satisfies Record<AppPreferences["threeDQuality"], { radialSegments: number; lengthStep: number; pixelRatio: number; shadows: boolean }>;

interface SceneRuntime {
  camera: THREE.PerspectiveCamera;
  content: THREE.Object3D;
  controls: OrbitControls;
  drag: DragControls;
  grid: THREE.GridHelper;
  renderer: THREE.WebGLRenderer;
  resize: ResizeObserver;
  scene: THREE.Scene;
  transform: TransformControls;
  refreshNodeConnections?: (nodeId: string, activePinId?: string) => void;
}

interface ThreeVisibility {
  housings: boolean;
  jackets: boolean;
  cores: boolean;
  accessories: boolean;
  labels: boolean;
  grid: boolean;
  xray: boolean;
}

interface ThreeSelection {
  kind: "node" | "segment" | "routePoint" | "accessory" | "pinConnection";
  id: string;
  pinId?: string;
  routePointIndex?: number;
}

type PartRotation = { x: number; y: number; z: number };

function applyPartRotation(object: THREE.Object3D, rotation?: PartRotation) {
  object.rotation.set(
    THREE.MathUtils.degToRad(rotation?.x ?? 0),
    THREE.MathUtils.degToRad(rotation?.y ?? 0),
    THREE.MathUtils.degToRad(rotation?.z ?? 0),
  );
}

function partRotationDegrees(object: THREE.Object3D): PartRotation {
  return {
    x: Number(THREE.MathUtils.radToDeg(object.rotation.x).toFixed(2)),
    y: Number(THREE.MathUtils.radToDeg(object.rotation.y).toFixed(2)),
    z: Number(THREE.MathUtils.radToDeg(object.rotation.z).toFixed(2)),
  };
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

function inletDirectionVector(placement: ModelPlacement) {
  const direction = modelInletDirection(placement);
  return new THREE.Vector3(direction.x, direction.y, direction.z);
}

function placeConnectorVisual(visual: THREE.Object3D, placement: ModelPlacement) {
  const direction = inletDirectionVector(placement);
  const bounds = new THREE.Box3().setFromObject(visual, true);
  const size = bounds.getSize(new THREE.Vector3());
  const halfExtent = Math.abs(direction.x) * size.x / 2 + Math.abs(direction.y) * size.y / 2 + Math.abs(direction.z) * size.z / 2;
  const anchor = direction.clone().multiplyScalar(halfExtent).add(new THREE.Vector3(placement.offsetX, placement.offsetY, placement.offsetZ));
  visual.position.sub(anchor);
  const rotationTarget = new THREE.Group();
  rotationTarget.name = "model-placement-rotation";
  rotationTarget.rotation.set(
    THREE.MathUtils.degToRad(placement.rotationXDeg),
    THREE.MathUtils.degToRad(placement.rotationYDeg),
    THREE.MathUtils.degToRad(placement.rotationZDeg),
  );
  rotationTarget.add(visual);
  const root = new THREE.Group();
  const roll = new THREE.Quaternion().setFromAxisAngle(direction, THREE.MathUtils.degToRad(placement.rollDeg));
  root.quaternion.copy(roll);
  root.add(rotationTarget);
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

function focusSceneObject(runtime: SceneRuntime, kind: ThreeSceneItem["kind"], id: string) {
  const key = kind === "node" ? "nodeId" : kind === "segment" ? "segmentId" : "accessoryId";
  const object = runtime.content.children.find((child) => child.userData[key] === id);
  if (!object) return;
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const direction = runtime.camera.position.clone().sub(runtime.controls.target).normalize();
  const distance = Math.max(size.x, size.y, size.z, 12) * 3;
  runtime.controls.target.copy(center);
  runtime.camera.position.copy(center).addScaledVector(direction.lengthSq() ? direction : new THREE.Vector3(0.65, 0.8, 0.75).normalize(), distance);
  runtime.camera.near = Math.max(distance / 1000, 0.01);
  runtime.camera.far = distance * 30;
  runtime.camera.updateProjectionMatrix();
  runtime.controls.update();
}

type StandardView = "iso" | "front" | "top" | "right";

function setStandardView(runtime: SceneRuntime, view: StandardView) {
  const bounds = new THREE.Box3().setFromObject(runtime.content);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const distance = Math.max(size.x, size.y, size.z, 20) * 1.7;
  const direction = view === "front" ? new THREE.Vector3(0, 0, 1)
    : view === "top" ? new THREE.Vector3(0, 1, 0)
      : view === "right" ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0.65, 0.8, 0.75).normalize();
  runtime.camera.position.copy(center).addScaledVector(direction, distance);
  runtime.camera.up.set(0, view === "top" ? 0 : 1, view === "top" ? -1 : 0);
  runtime.controls.target.copy(center);
  runtime.camera.near = Math.max(distance / 1000, 0.01);
  runtime.camera.far = distance * 20;
  runtime.camera.updateProjectionMatrix();
  runtime.controls.update();
}

function captureViewpoint(runtime: SceneRuntime, name: string): Saved3DViewpoint {
  return {
    id: crypto.randomUUID(),
    name,
    position: runtime.camera.position.toArray(),
    target: runtime.controls.target.toArray(),
    up: runtime.camera.up.toArray(),
  };
}

function restoreViewpoint(runtime: SceneRuntime, viewpoint: Saved3DViewpoint) {
  runtime.camera.position.fromArray(viewpoint.position);
  runtime.controls.target.fromArray(viewpoint.target);
  runtime.camera.up.fromArray(viewpoint.up);
  runtime.camera.updateProjectionMatrix();
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

function segmentCurve(start: THREE.Vector3, end: THREE.Vector3, cableLengthMm: number, route: HarnessAssembly["segments"][number]["threeDRoute"], startPort?: ConnectionPort, endPort?: ConnectionPort) {
  if (route?.controlPoints.length) {
    const points = [...route.controlPoints]
      .sort((left, right) => left.t - right.t)
      .map((point) => {
        const position = positionHarnessRoutePoint(start, end, point);
        return new THREE.Vector3(position.x, position.y, position.z);
      });
    return buildInletCurve(start, end, startPort?.direction, endPort?.direction, startPort?.straightLeadMm, endPort?.straightLeadMm, points);
  }
  const axis = end.clone().sub(start);
  const displayLength = axis.length();
  const coil = getCompactCoilLayout(cableLengthMm, displayLength);
  if (!coil) return buildInletCurve(start, end, startPort?.direction, endPort?.direction, startPort?.straightLeadMm, endPort?.straightLeadMm);
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
  return buildInletCurve(start, end, startPort?.direction, endPort?.direction, startPort?.straightLeadMm, endPort?.straightLeadMm, points.slice(1, -1));
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

function visualLayer(name: string, visible: boolean) {
  const group = new THREE.Group();
  group.name = name;
  group.visible = visible;
  return group;
}

function setObjectOpacity(object: THREE.Object3D, opacity: number) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.transparent = opacity < 1;
      material.opacity = opacity;
      material.depthWrite = opacity >= 1;
      material.needsUpdate = true;
    }
  });
}

type PinPositionMap = Map<string, THREE.Vector3>;
type ConnectionPort = { direction: THREE.Vector3; straightLeadMm: number };
type ConnectionPortMap = Map<string, ConnectionPort>;
type PinConnectionPortMap = Map<string, ConnectionPort>;

function connectionPortAtNode(nodeId: string, pinId: string | undefined, connectionPorts: ConnectionPortMap, pinConnectionPorts: PinConnectionPortMap) {
  return pinId ? pinConnectionPorts.get(pinConnectionKey(nodeId, pinId)) ?? connectionPorts.get(nodeId) : connectionPorts.get(nodeId);
}

function conductorSegmentEndpoints(segment: HarnessAssembly["segments"][number], conductor: HarnessAssembly["conductors"][number], start: THREE.Vector3, end: THREE.Vector3, pinPositions: PinPositionMap) {
  const startPinId = getConductorPinIdAtNode(conductor, segment.fromNodeId);
  const endPinId = getConductorPinIdAtNode(conductor, segment.toNodeId);
  const conductorStart = startPinId ? pinPositions.get(pinConnectionKey(segment.fromNodeId, startPinId)) ?? start : start;
  const conductorEnd = endPinId ? pinPositions.get(pinConnectionKey(segment.toNodeId, endPinId)) ?? end : end;
  return { start: conductorStart, end: conductorEnd };
}

function conductorSegmentCurve(segment: HarnessAssembly["segments"][number], conductor: HarnessAssembly["conductors"][number], start: THREE.Vector3, end: THREE.Vector3, pinPositions: PinPositionMap, connectionPorts: ConnectionPortMap, pinConnectionPorts: PinConnectionPortMap) {
  const endpoints = conductorSegmentEndpoints(segment, conductor, start, end, pinPositions);
  const startPinId = getConductorPinIdAtNode(conductor, segment.fromNodeId);
  const endPinId = getConductorPinIdAtNode(conductor, segment.toNodeId);
  return segmentCurve(endpoints.start, endpoints.end, segment.lengthMm, segment.threeDRoute, connectionPortAtNode(segment.fromNodeId, startPinId, connectionPorts, pinConnectionPorts), connectionPortAtNode(segment.toNodeId, endPinId, connectionPorts, pinConnectionPorts));
}

function addSegmentVisual(runtime: SceneRuntime, project: ProjectDocument, harness: HarnessAssembly, segment: HarnessAssembly["segments"][number], start: THREE.Vector3, end: THREE.Vector3, pinPositions: PinPositionMap, connectionPorts: ConnectionPortMap, pinConnectionPorts: PinConnectionPortMap, selected: boolean, quality: AppPreferences["threeDQuality"], visibility: ThreeVisibility, coreSeparation: number, wireThickness: number, editRoute: boolean) {
  const cablePart = project.parts.find((part) => part.id === segment.cablePartId);
  const spec = getCableRenderSpec(cablePart);
  const conductors = harness.conductors.filter((conductor) => spec
    ? conductor.cableRunId === segment.id
    : !conductor.cableRunId && conductor.routeSegmentIds.includes(segment.id));
  const group = new THREE.Group();
  group.userData.segmentId = segment.id;
  group.userData.sceneKind = "segment";
  const jacketLayer = visualLayer("jacket", visibility.jackets);
  const coreLayer = visualLayer("cores", visibility.cores);
  const accessoryLayer = visualLayer("accessories", visibility.accessories);
  group.add(jacketLayer, coreLayer, accessoryLayer);
  const curve = segmentCurve(start, end, segment.lengthMm, segment.threeDRoute, connectionPorts.get(segment.fromNodeId), connectionPorts.get(segment.toNodeId));
  if (editRoute) {
    for (const [index, point] of (segment.threeDRoute?.controlPoints ?? []).entries()) {
      const position = positionHarnessRoutePoint(start, end, point);
      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(3.2, 16, 10),
        new THREE.MeshBasicMaterial({ color: 0x18a7d4, depthTest: false, depthWrite: false, transparent: true }),
      );
      handle.renderOrder = 1000;
      handle.position.set(position.x, position.y, position.z);
      handle.userData = { segmentId: segment.id, routePointIndex: index, routeStart: start.toArray(), routeEnd: end.toArray() };
      group.add(handle);
    }
  }
  if (!spec) {
    if (!conductors.length) {
      const cable = tubeAlongCurve(curve, 0, segment.lengthMm, segment.lengthMm, 1.15 * wireThickness, selected ? 0xf0a53b : 0x263f54, quality);
      if (cable) jacketLayer.add(cable);
    } else {
      const wires = conductors.map((conductor) => ({
        conductor,
        diameterMm: getWireRenderDiameterMm(project.parts.find((part) => part.id === conductor.wirePartId), conductor.gauge),
        curve: conductorSegmentCurve(segment, conductor, start, end, pinPositions, connectionPorts, pinConnectionPorts),
      }));
      const offsets = getIndividualWireOffsets(wires.map((wire) => wire.diameterMm));
      wires.forEach((wire, index) => {
        const hasPinEndpoint = Boolean(getConductorPinIdAtNode(wire.conductor, segment.fromNodeId) || getConductorPinIdAtNode(wire.conductor, segment.toNodeId));
        const offset = hasPinEndpoint ? undefined : { x: offsets[index].x * coreSeparation, y: offsets[index].y * coreSeparation };
        const tube = tubeAlongCurve(wire.curve, 0, segment.lengthMm, segment.lengthMm, wire.diameterMm * wireThickness / 2, selected ? 0xf0a53b : wireColor(wire.conductor.color), quality, offset);
        if (tube) coreLayer.add(tube);
      });
    }
    runtime.content.add(group);
    return;
  }

  const lengthMm = segment.lengthMm;
  if (lengthMm <= 0) return;
  if (!conductors.length) {
    const jacket = tubeAlongCurve(curve, 0, lengthMm, lengthMm, spec.outerDiameterMm * wireThickness / 2, selected ? 0xf0a53b : wireColor(spec.jacketColor), quality);
    if (jacket) jacketLayer.add(jacket);
    runtime.content.add(group);
    return;
  }

  const { breakoutMm } = getCableSpans(lengthMm, spec.breakoutLengthMm);
  const displayPolicy = getCableDisplayPolicy(visibility.xray, visibility.jackets);
  const jacket = tubeAlongCurve(curve, breakoutMm, lengthMm - breakoutMm, lengthMm, spec.outerDiameterMm * wireThickness / 2, selected ? 0xf0a53b : wireColor(spec.jacketColor), quality);
  if (jacket) {
    setObjectOpacity(jacket, displayPolicy.jacketOpacity);
    jacketLayer.add(jacket);
  }

  const offsets = getCoreOffsets(conductors.length, spec.outerDiameterMm * wireThickness, spec.coreDiameterMm * wireThickness).map((offset) => ({ x: offset.x * coreSeparation, y: offset.y * coreSeparation }));
  conductors.forEach((conductor, index) => {
    const endpoints = conductorSegmentEndpoints(segment, conductor, start, end, pinPositions);
    const startPinId = getConductorPinIdAtNode(conductor, segment.fromNodeId);
    const endPinId = getConductorPinIdAtNode(conductor, segment.toNodeId);
    const startPort = connectionPortAtNode(segment.fromNodeId, startPinId, connectionPorts, pinConnectionPorts);
    const endPort = connectionPortAtNode(segment.toNodeId, endPinId, connectionPorts, pinConnectionPorts);
    const coreCurves = buildCableCoreCurves(curve, endpoints.start, endpoints.end, breakoutMm / lengthMm, offsets[index], startPort?.direction, endPort?.direction, startPort?.straightLeadMm, endPort?.straightLeadMm);
    if (displayPolicy.showFullLengthCores) {
      const exposedCore = tubeAlongCurve(coreCurves.full, 0, lengthMm, lengthMm, spec.coreDiameterMm * wireThickness / 2, wireColor(conductor.color), quality);
      if (exposedCore) coreLayer.add(exposedCore);
      return;
    }
    const coreStart = tubeAlongCurve(coreCurves.start, 0, breakoutMm, breakoutMm, spec.coreDiameterMm * wireThickness / 2, wireColor(conductor.color), quality);
    const coreEnd = tubeAlongCurve(coreCurves.end, 0, breakoutMm, breakoutMm, spec.coreDiameterMm * wireThickness / 2, wireColor(conductor.color), quality);
    if (coreStart) coreLayer.add(coreStart);
    if (coreEnd) coreLayer.add(coreEnd);
  });

  if (spec.construction === "shieldedMultiCore") {
    const shield = tubeAlongCurve(curve, breakoutMm, lengthMm - breakoutMm, lengthMm, spec.outerDiameterMm * wireThickness * 0.43, 0xaeb8c2, quality);
    if (shield) {
      setObjectOpacity(shield, displayPolicy.shieldOpacity);
      accessoryLayer.add(shield);
    }
  }

  const coveringRadius = spec.outerDiameterMm * wireThickness / 2 + 0.45;
  if (segment.sleevePartId) {
    const sleeve = tubeAlongCurve(curve, breakoutMm, lengthMm - breakoutMm, lengthMm, coveringRadius, 0x596a75, quality);
    if (sleeve) accessoryLayer.add(sleeve);
  }
  if (segment.tapePartId) {
    const tape = tubeAlongCurve(curve, lengthMm * 0.42, lengthMm * 0.58, lengthMm, coveringRadius + 0.25, 0x161b20, quality);
    if (tape) accessoryLayer.add(tape);
  }

  const heatShrinks = [
    { partId: segment.startHeatShrinkPartId, centerMm: breakoutMm },
    { partId: segment.endHeatShrinkPartId, centerMm: lengthMm - breakoutMm },
  ];
  for (const heatShrink of heatShrinks) {
    const heatShrinkPart = project.parts.find((part) => part.id === heatShrink.partId);
    const heatShrinkSpec = getHeatShrinkRenderSpec(heatShrinkPart);
    if (!heatShrinkSpec) continue;
    const span = getHeatShrinkSpan(lengthMm, heatShrink.centerMm, heatShrinkSpec.lengthMm);
    const tube = tubeAlongCurve(curve, span.startMm, span.endMm, lengthMm, heatShrinkSpec.finishedDiameterMm * wireThickness / 2, wireColor(heatShrinkSpec.color), quality);
    if (tube) accessoryLayer.add(tube);
  }
  runtime.content.add(group);
}

function addDirectWireVisuals(runtime: SceneRuntime, project: ProjectDocument, harness: HarnessAssembly, nodePositions: Map<string, THREE.Vector3>, pinPositions: PinPositionMap, connectionPorts: ConnectionPortMap, pinConnectionPorts: PinConnectionPortMap, quality: AppPreferences["threeDQuality"], visibility: ThreeVisibility, wireThickness: number) {
  for (const conductor of directWireConductors(harness)) {
    const nodeStart = nodePositions.get(conductor.from.nodeId);
    const nodeEnd = nodePositions.get(conductor.to.nodeId);
    if (!nodeStart || !nodeEnd) continue;
    const start = conductor.from.pinId ? pinPositions.get(pinConnectionKey(conductor.from.nodeId, conductor.from.pinId)) ?? nodeStart : nodeStart;
    const end = conductor.to.pinId ? pinPositions.get(pinConnectionKey(conductor.to.nodeId, conductor.to.pinId)) ?? nodeEnd : nodeEnd;
    const lengthMm = directWireLengthMm(harness, conductor);
    const curve = segmentCurve(start, end, lengthMm, undefined, connectionPortAtNode(conductor.from.nodeId, conductor.from.pinId, connectionPorts, pinConnectionPorts), connectionPortAtNode(conductor.to.nodeId, conductor.to.pinId, connectionPorts, pinConnectionPorts));
    const diameterMm = getWireRenderDiameterMm(project.parts.find((part) => part.id === conductor.wirePartId), conductor.gauge);
    const tube = tubeAlongCurve(curve, 0, lengthMm, lengthMm, diameterMm * wireThickness / 2, wireColor(conductor.color), quality);
    if (!tube) continue;
    const group = visualLayer("direct-wire", visibility.cores);
    group.userData.sceneKind = "directConductor";
    group.userData.conductorId = conductor.id;
    group.add(tube);
    runtime.content.add(group);
  }
}

function useThreeScene(quality: AppPreferences["threeDQuality"], onSelect?: (selection: ThreeSelection) => void, onRoutePointCommit?: (segmentId: string, index: number, point: { t: number; offsetX: number; offsetY: number }) => void, nodeLayoutEditing = false, partRotationEditing = false, onNodePositionCommit?: (nodeId: string, position: { x: number; y: number; z: number }) => void, onAccessoryOffsetCommit?: (accessoryId: string, offset: { x: number; y: number; z: number }) => void, onNodeRotationCommit?: (nodeId: string, rotation: PartRotation) => void, onAccessoryRotationCommit?: (accessoryId: string, rotation: PartRotation) => void, onPinConnectionCommit?: (nodeId: string, pinId: string, offset: { x: number; y: number; z: number }) => void) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const selectRef = useRef(onSelect);
  const routeCommitRef = useRef(onRoutePointCommit);
  const nodeLayoutRef = useRef(nodeLayoutEditing);
  const partRotationRef = useRef(partRotationEditing);
  const nodePositionCommitRef = useRef(onNodePositionCommit);
  const accessoryOffsetCommitRef = useRef(onAccessoryOffsetCommit);
  const nodeRotationCommitRef = useRef(onNodeRotationCommit);
  const accessoryRotationCommitRef = useRef(onAccessoryRotationCommit);
  const pinConnectionCommitRef = useRef(onPinConnectionCommit);
  selectRef.current = onSelect;
  routeCommitRef.current = onRoutePointCommit;
  nodeLayoutRef.current = nodeLayoutEditing;
  partRotationRef.current = partRotationEditing;
  nodePositionCommitRef.current = onNodePositionCommit;
  accessoryOffsetCommitRef.current = onAccessoryOffsetCommit;
  nodeRotationCommitRef.current = onNodeRotationCommit;
  accessoryRotationCommitRef.current = onAccessoryRotationCommit;
  pinConnectionCommitRef.current = onPinConnectionCommit;

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
    const content = new THREE.Object3D();
    scene.add(content, new THREE.HemisphereLight(0xffffff, 0x657383, 2.2));
    const light = new THREE.DirectionalLight(0xffffff, 2.4);
    light.position.set(80, 120, 70);
    light.castShadow = true;
    scene.add(light);
    const grid = new THREE.GridHelper(2000, 100, 0x8fa2b2, 0xc4cfd8);
    grid.material.opacity = 0.45;
    grid.material.transparent = true;
    scene.add(grid);
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setMode("translate");
    transform.setSize(0.7);
    scene.add(transform.getHelper());
    const drag = new DragControls([], camera, renderer.domElement);
    drag.enabled = false;
    drag.transformGroup = true;
    const handleNodeDragStart = (event: { object: THREE.Object3D }) => {
      controls.enabled = false;
      transform.detach();
      if (event.object.userData.nodeId) selectRef.current?.({ kind: "node", id: event.object.userData.nodeId as string });
      else if (event.object.userData.accessoryId) selectRef.current?.({ kind: "accessory", id: event.object.userData.accessoryId as string });
    };
    const handleNodeDrag = (event: { object: THREE.Object3D }) => {
      if (event.object.userData.nodeId) runtime.refreshNodeConnections?.(event.object.userData.nodeId as string);
    };
    const handleNodeDragEnd = (event: { object: THREE.Object3D }) => {
      controls.enabled = true;
      if (event.object.userData.nodeId) {
        nodePositionCommitRef.current?.(event.object.userData.nodeId as string, {
          x: event.object.position.x,
          y: event.object.position.y,
          z: event.object.position.z,
        });
      } else if (event.object.userData.accessoryId) {
        const [anchorX, anchorY, anchorZ] = event.object.userData.accessoryAnchor as [number, number, number];
        accessoryOffsetCommitRef.current?.(event.object.userData.accessoryId as string, {
          x: event.object.position.x - anchorX,
          y: event.object.position.y - anchorY,
          z: event.object.position.z - anchorZ,
        });
      }
    };
    drag.addEventListener("dragstart", handleNodeDragStart);
    drag.addEventListener("drag", handleNodeDrag);
    drag.addEventListener("dragend", handleNodeDragEnd);
    const handleTransformDrag = (event: { value: unknown }) => { controls.enabled = !Boolean(event.value); };
    const handleTransformChange = () => {
      const target = transform.object;
      if (target?.userData.nodeId) runtime.refreshNodeConnections?.(target.userData.nodeId as string);
    };
    const handleTransformCommit = () => {
      const target = transform.object;
      if (!target) return;
      if (target.userData.routePointIndex !== undefined) {
        const [startX, startY, startZ] = target.userData.routeStart as [number, number, number];
        const [endX, endY, endZ] = target.userData.routeEnd as [number, number, number];
        const point = projectHarnessRoutePoint(
          { x: startX, y: startY, z: startZ },
          { x: endX, y: endY, z: endZ },
          { x: target.position.x, y: target.position.y, z: target.position.z },
        );
        routeCommitRef.current?.(target.userData.segmentId as string, target.userData.routePointIndex as number, point);
      } else if (transform.getMode() === "rotate" && target.userData.nodeId) {
        nodeRotationCommitRef.current?.(target.userData.nodeId as string, partRotationDegrees(target));
      } else if (transform.getMode() === "rotate" && target.userData.accessoryId) {
        accessoryRotationCommitRef.current?.(target.userData.accessoryId as string, partRotationDegrees(target));
      } else if (target.userData.nodeId) {
        nodePositionCommitRef.current?.(target.userData.nodeId as string, { x: target.position.x, y: target.position.y, z: target.position.z });
      }
    };
    transform.addEventListener("dragging-changed", handleTransformDrag);
    transform.addEventListener("objectChange", handleTransformChange);
    transform.addEventListener("mouseUp", handleTransformCommit);
    const resize = new ResizeObserver(() => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resize.observe(host);
    const runtime: SceneRuntime = { camera, content, controls, drag, grid, renderer, resize, scene, transform };
    runtimeRef.current = runtime;
    let pointer = { x: 0, y: 0 };
    let pinSurfaceDrag: { handle: THREE.Object3D; node: THREE.Object3D; pointerId: number } | null = null;
    const raycaster = new THREE.Raycaster();
    const setPointerRay = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(mouse, camera);
    };
    const pinHandleFromEvent = (event: PointerEvent) => {
      setPointerRay(event);
      const rect = renderer.domElement.getBoundingClientRect();
      const candidates = new Map<string, { target: THREE.Object3D; screenX: number; screenY: number; hitDistance: number }>();
      for (const hit of raycaster.intersectObjects(content.children, true)) {
        let target: THREE.Object3D | null = hit.object;
        while (target && !target.userData.pinConnection && target !== content) target = target.parent;
        if (!target?.userData.pinConnection || candidates.has(target.uuid)) continue;
        const screen = target.getWorldPosition(new THREE.Vector3()).project(camera);
        candidates.set(target.uuid, {
          target,
          screenX: rect.left + (screen.x + 1) * rect.width / 2,
          screenY: rect.top + (1 - screen.y) * rect.height / 2,
          hitDistance: hit.distance,
        });
      }
      return closestPinConnectionCandidate([...candidates.values()], { x: event.clientX, y: event.clientY });
    };
    const pointerDown = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (event.button !== 0) return;
      const handle = pinHandleFromEvent(event);
      if (!handle) return;
      const node = content.children.find((child) => child.userData.sceneKind === "node" && child.userData.nodeId === handle.userData.nodeId);
      if (!node) return;
      pinSurfaceDrag = { handle, node, pointerId: event.pointerId };
      controls.enabled = false;
      transform.detach();
      renderer.domElement.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    };
    const pointerMove = (event: PointerEvent) => {
      if (!pinSurfaceDrag || event.pointerId !== pinSurfaceDrag.pointerId) return;
      setPointerRay(event);
      scene.updateMatrixWorld(true);
      const hit = raycaster.intersectObject(pinSurfaceDrag.node, true).find((item) => item.object instanceof THREE.Mesh);
      if (!hit) return;
      pinSurfaceDrag.handle.position.copy(hit.point);
      runtime.refreshNodeConnections?.(pinSurfaceDrag.handle.userData.nodeId as string, pinSurfaceDrag.handle.userData.pinId as string);
    };
    const finishPinSurfaceDrag = (event: PointerEvent) => {
      if (!pinSurfaceDrag || event.pointerId !== pinSurfaceDrag.pointerId) return false;
      const { handle, node } = pinSurfaceDrag;
      pinSurfaceDrag = null;
      controls.enabled = true;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      const localOffset = handle.position.clone().sub(node.position).applyQuaternion(node.quaternion.clone().invert());
      pinConnectionCommitRef.current?.(handle.userData.nodeId as string, handle.userData.pinId as string, { x: localOffset.x, y: localOffset.y, z: localOffset.z });
      selectRef.current?.({ kind: "pinConnection", id: handle.userData.nodeId as string, pinId: handle.userData.pinId as string });
      return true;
    };
    const pointerUp = (event: PointerEvent) => {
      if (finishPinSurfaceDrag(event)) return;
      if (!selectRef.current || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 4) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(content.children, true);
      let target: THREE.Object3D | null = hits[0]?.object ?? null;
      while (target && !target.userData.nodeId && !target.userData.segmentId && !target.userData.accessoryId) target = target.parent;
      if (target?.userData.routePointIndex !== undefined) {
        transform.setMode("translate");
        transform.attach(target);
        selectRef.current?.({ kind: "routePoint", id: target.userData.segmentId as string, routePointIndex: target.userData.routePointIndex as number });
      } else if (target?.userData.pinConnection) {
        drag.objects.length = 0;
        drag.enabled = false;
        transform.detach();
        selectRef.current?.({ kind: "pinConnection", id: target.userData.nodeId as string, pinId: target.userData.pinId as string });
      } else if (target?.userData.accessoryId) {
        transform.detach();
        if (partRotationRef.current) {
          drag.objects.length = 0;
          drag.enabled = false;
          transform.setMode("rotate");
          transform.attach(target);
        } else if (nodeLayoutRef.current) {
          drag.objects.splice(0, drag.objects.length, target);
          drag.enabled = true;
        } else {
          drag.objects.length = 0;
          drag.enabled = false;
        }
        selectRef.current?.({ kind: "accessory", id: target.userData.accessoryId as string });
      } else if (target?.userData.nodeId) {
        transform.detach();
        if (partRotationRef.current && target.userData.movable) {
          drag.objects.length = 0;
          drag.enabled = false;
          transform.setMode("rotate");
          transform.attach(target);
        } else if (nodeLayoutRef.current && target.userData.movable) {
          drag.objects.splice(0, drag.objects.length, target);
          drag.enabled = true;
        } else {
          drag.objects.length = 0;
          drag.enabled = false;
        }
        selectRef.current?.({ kind: "node", id: target.userData.nodeId as string });
      } else if (target?.userData.segmentId) {
        transform.detach();
        selectRef.current?.({ kind: "segment", id: target.userData.segmentId as string });
      } else transform.detach();
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown, true);
    renderer.domElement.addEventListener("pointermove", pointerMove, true);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointercancel", finishPinSurfaceDrag);
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => {
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointerdown", pointerDown, true);
      renderer.domElement.removeEventListener("pointermove", pointerMove, true);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointercancel", finishPinSurfaceDrag);
      resize.disconnect();
      transform.removeEventListener("dragging-changed", handleTransformDrag);
      transform.removeEventListener("objectChange", handleTransformChange);
      transform.removeEventListener("mouseUp", handleTransformCommit);
      transform.dispose();
      drag.removeEventListener("dragstart", handleNodeDragStart);
      drag.removeEventListener("drag", handleNodeDrag);
      drag.removeEventListener("dragend", handleNodeDragEnd);
      drag.dispose();
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, [quality]);
  return { hostRef, runtimeRef };
}

function addAccessoryVisuals(runtime: SceneRuntime, project: ProjectDocument, harness: HarnessAssembly, positions: Map<string, THREE.Vector3>, visibility: ThreeVisibility) {
  if (!visibility.accessories) return;
  const fallback = positions.values().next().value as THREE.Vector3 | undefined;
  harness.accessories.forEach((accessory, index) => {
    const part = project.parts.find((item) => item.id === accessory.partId);
    if (!part) return;
    const nodePosition = accessory.nodeId ? positions.get(accessory.nodeId) : undefined;
    const segment = harness.segments.find((item) => item.id === accessory.segmentId);
    const start = segment ? positions.get(segment.fromNodeId) : undefined;
    const end = segment ? positions.get(segment.toNodeId) : undefined;
    const anchor = nodePosition?.clone().add(new THREE.Vector3(0, 0, 16)) ?? (start && end ? start.clone().lerp(end, 0.5) : fallback?.clone().add(new THREE.Vector3(index * 14, 12, 18)));
    if (!anchor) return;
    const offset = accessory.threeDOffset ?? { x: 0, y: 0, z: 0 };
    const group = new THREE.Group();
    group.userData.accessoryId = accessory.id;
    group.userData.sceneKind = "accessory";
    group.userData.attachedNodeId = accessory.nodeId;
    group.userData.attachedSegmentId = accessory.segmentId;
    group.userData.accessoryAnchor = [anchor.x, anchor.y, anchor.z];
    group.userData.accessoryOffset = [offset.x, offset.y, offset.z];
    group.position.copy(anchor).add(new THREE.Vector3(offset.x, offset.y, offset.z));
    applyPartRotation(group, accessory.threeDRotation);
    let visual: THREE.Mesh;
    if (part.category === "clip") visual = new THREE.Mesh(new THREE.TorusGeometry(6, 1.4, 8, 20), new THREE.MeshStandardMaterial({ color: 0x4aa873, metalness: 0.2, roughness: 0.55 }));
    else if (part.category === "label") visual = new THREE.Mesh(new THREE.BoxGeometry(18, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0xf0c84a, roughness: 0.7 }));
    else if (part.category === "lug" || part.category === "terminal" || part.category === "seal") visual = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 8, 12), new THREE.MeshStandardMaterial({ color: part.category === "seal" ? 0xd9863c : 0xb9c1c7, metalness: 0.35, roughness: 0.45 }));
    else visual = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 8), new THREE.MeshStandardMaterial({ color: 0x8e6cc0, roughness: 0.65 }));
    visual.castShadow = true;
    group.add(visual);
    if (visibility.labels) {
      const label = labelSprite(`${part.category.toUpperCase()} · ${part.partNumber}`);
      label.position.set(0, 8, 0);
      group.add(label);
    }
    runtime.content.add(group);
  });
}

function buildPinPositions(harness: HarnessAssembly, nodePositions: Map<string, THREE.Vector3>) {
  const pinPositions: PinPositionMap = new Map();
  for (const node of harness.nodes) {
    const nodePosition = nodePositions.get(node.id);
    if (!nodePosition) continue;
    for (const pin of node.pins) {
      const position = getPinConnectionPosition(node, pin.id, nodePosition);
      pinPositions.set(pinConnectionKey(node.id, pin.id), new THREE.Vector3(position.x, position.y, position.z));
    }
  }
  return pinPositions;
}

function scenePinPositions(runtime: SceneRuntime) {
  const pinPositions: PinPositionMap = new Map();
  for (const nodeObject of runtime.content.children.filter((child) => child.userData.sceneKind === "node")) {
    const offsets = nodeObject.userData.pinConnectionOffsets as Record<string, [number, number, number]> | undefined;
    for (const [pinId, offset] of Object.entries(offsets ?? {})) {
      pinPositions.set(pinConnectionKey(nodeObject.userData.nodeId as string, pinId), nodeObject.position.clone().add(new THREE.Vector3(...offset).applyQuaternion(nodeObject.quaternion)));
    }
  }
  for (const handle of runtime.content.children.filter((child) => child.userData.pinConnection)) {
    pinPositions.set(pinConnectionKey(handle.userData.nodeId as string, handle.userData.pinId as string), handle.position.clone());
  }
  return pinPositions;
}

function sceneConnectionPorts(runtime: SceneRuntime, harness: HarnessAssembly) {
  const connectionPorts: ConnectionPortMap = new Map();
  const pinConnectionPorts: PinConnectionPortMap = new Map();
  for (const object of runtime.content.children) {
    if (object.userData.sceneKind !== "node" || !object.userData.inletDirection) continue;
    const nodeId = object.userData.nodeId as string;
    const localDirection = new THREE.Vector3().fromArray(object.userData.inletDirection as [number, number, number]);
    connectionPorts.set(nodeId, {
      direction: connectorWorldDirection(localDirection, object.quaternion),
      straightLeadMm: object.userData.straightLeadMm as number,
    });
    const node = harness.nodes.find((item) => item.id === nodeId);
    const pinPorts = object.userData.pinInletPorts as ModelPlacement["pinPorts"] | undefined;
    for (const pin of node?.pins ?? []) {
      const pinPort = pinPorts?.find((port) => port.pinNumber === pin.number);
      if (!pinPort) continue;
      pinConnectionPorts.set(pinConnectionKey(nodeId, pin.id), {
        direction: connectorWorldDirection(new THREE.Vector3(pinPort.directionX, pinPort.directionY, pinPort.directionZ), object.quaternion),
        straightLeadMm: pinPort.straightLeadMm,
      });
    }
  }
  return { connectionPorts, pinConnectionPorts };
}

function refreshNodeConnections(runtime: SceneRuntime, project: ProjectDocument, harness: HarnessAssembly, nodeId: string, selectedEntityId: string | null, quality: AppPreferences["threeDQuality"], visibility: ThreeVisibility, coreSeparation: number, wireThickness: number, activePinId?: string) {
  const nodeObject = (id: string) => runtime.content.children.find((child) => child.userData.sceneKind === "node" && child.userData.nodeId === id);
  const movedNode = nodeObject(nodeId);
  if (!movedNode) return;
  for (const handle of runtime.content.children.filter((child) => child.userData.pinConnection && child.userData.nodeId === nodeId)) {
    if (handle.userData.pinId === activePinId) continue;
    const [offsetX, offsetY, offsetZ] = handle.userData.connectionOffset as [number, number, number];
    handle.position.copy(movedNode.position).add(new THREE.Vector3(offsetX, offsetY, offsetZ).applyQuaternion(movedNode.quaternion));
    handle.userData.nodeOrigin = movedNode.position.toArray();
  }
  const pinPositions = scenePinPositions(runtime);
  const { connectionPorts, pinConnectionPorts } = sceneConnectionPorts(runtime, harness);
  const connectedSegments = harness.segments.filter((segment) => segment.fromNodeId === nodeId || segment.toNodeId === nodeId);
  for (const segment of connectedSegments) {
    const current = runtime.content.children.find((child) => child.userData.sceneKind === "segment" && child.userData.segmentId === segment.id);
    if (current) {
      runtime.content.remove(current);
      disposeObject(current);
    }
    const start = nodeObject(segment.fromNodeId)?.position;
    const end = nodeObject(segment.toNodeId)?.position;
    if (start && end) addSegmentVisual(runtime, project, harness, segment, start, end, pinPositions, connectionPorts, pinConnectionPorts, selectedEntityId === segment.id, quality, visibility, coreSeparation, wireThickness, false);
  }
  for (const directWire of runtime.content.children.filter((child) => child.userData.sceneKind === "directConductor")) {
    runtime.content.remove(directWire);
    disposeObject(directWire);
  }
  addDirectWireVisuals(runtime, project, harness, new Map(harness.nodes.flatMap((node) => {
    const object = nodeObject(node.id);
    return object ? [[node.id, object.position] as const] : [];
  })), pinPositions, connectionPorts, pinConnectionPorts, quality, visibility, wireThickness);
  for (const accessory of runtime.content.children.filter((child) => child.userData.sceneKind === "accessory")) {
    const applyAnchor = (anchor: THREE.Vector3) => {
      const [offsetX, offsetY, offsetZ] = accessory.userData.accessoryOffset as [number, number, number];
      accessory.userData.accessoryAnchor = [anchor.x, anchor.y, anchor.z];
      accessory.position.copy(anchor).add(new THREE.Vector3(offsetX, offsetY, offsetZ));
    };
    if (accessory.userData.attachedNodeId === nodeId) applyAnchor(movedNode.position.clone().add(new THREE.Vector3(0, 0, 16)));
    const segment = connectedSegments.find((item) => item.id === accessory.userData.attachedSegmentId);
    if (!segment) continue;
    const start = nodeObject(segment.fromNodeId)?.position;
    const end = nodeObject(segment.toNodeId)?.position;
    if (start && end) applyAnchor(start.clone().lerp(end, 0.5));
  }
}

function buildHarness(runtime: SceneRuntime, project: ProjectDocument, harness: HarnessAssembly, selectedEntityId: string | null, compactLayout: boolean, quality: AppPreferences["threeDQuality"], visibility: ThreeVisibility, coreSeparation: number, wireThickness: number, editRoute: boolean, editPinConnections: boolean) {
  runtime.transform.detach();
  runtime.drag.objects.length = 0;
  runtime.drag.enabled = false;
  disposeObject(runtime.content);
  runtime.content.clear();
  runtime.grid.visible = visibility.grid;
  const positions = new Map(Array.from(layoutHarnessNodes(harness, compactLayout ? 180 : undefined), ([id, position]) => [id, new THREE.Vector3(position.x, position.y, position.z)]));
  const pinPositions = buildPinPositions(harness, positions);
  for (const node of harness.nodes) {
    const group = new THREE.Group();
    group.userData.nodeId = node.id;
    group.userData.sceneKind = "node";
    group.userData.movable = true;
    group.position.copy(positions.get(node.id)!);
    applyPartRotation(group, node.threeDRotation);
    const part = project.parts.find((item) => item.id === node.partId);
    const asset = project.modelAssets.find((item) => item.id === part?.modelAssetId);
    const placement = asset ? getModelPlacement(part) : defaultModelPlacement;
    const visual = asset ? modelGroup(asset, selectedEntityId === node.id, undefined, placement.scale) : placeholderNode(node.kind, selectedEntityId === node.id, quality);
    if (node.kind === "connector") {
      const inletDirection = inletDirectionVector(placement);
      group.userData.inletDirection = inletDirection.toArray();
      group.userData.straightLeadMm = placement.straightLeadMm;
      group.userData.pinInletPorts = placement.pinPorts;
      group.add(placeConnectorVisual(visual, placement));
    } else {
      group.add(visual);
    }
    const label = labelSprite(`${node.reference} · ${part?.partNumber ?? node.label}`);
    label.position.set(0, 11, 0);
    label.visible = visibility.labels;
    group.add(label);
    group.visible = visibility.housings;
    runtime.content.add(group);
  }
  for (const node of harness.nodes.filter((item) => item.kind === "connector")) {
    const nodeObject = runtime.content.children.find((child) => child.userData.sceneKind === "node" && child.userData.nodeId === node.id);
    if (!nodeObject) continue;
    const direction = connectorWorldDirection(new THREE.Vector3().fromArray(nodeObject.userData.inletDirection as [number, number, number]), nodeObject.quaternion);
    const part = project.parts.find((item) => item.id === node.partId);
    const placement = getModelPlacement(part);
    for (const pin of node.pins) {
      const key = pinConnectionKey(node.id, pin.id);
      const desired = pinPositions.get(key);
      if (!desired) continue;
      const savedPinPort = placement.pinPorts.find((port) => port.pinNumber === pin.number);
      if (savedPinPort && !pin.threeDConnectionOffset) {
        pinPositions.set(key, nodeObject.position.clone().add(new THREE.Vector3(savedPinPort.offsetX, savedPinPort.offsetY, savedPinPort.offsetZ).applyQuaternion(nodeObject.quaternion)));
        continue;
      }
      const rotated = desired.clone().sub(nodeObject.position).applyQuaternion(nodeObject.quaternion).add(nodeObject.position);
      pinPositions.set(key, pin.threeDConnectionOffset ? rotated : projectPinToConnectorSurface(nodeObject, rotated, direction));
    }
    nodeObject.userData.pinConnectionOffsets = Object.fromEntries(node.pins.map((pin) => {
      const position = pinPositions.get(pinConnectionKey(node.id, pin.id)) ?? nodeObject.position;
      const offset = position.clone().sub(nodeObject.position).applyQuaternion(nodeObject.quaternion.clone().invert());
      return [pin.id, [offset.x, offset.y, offset.z]];
    }));
  }
  const { connectionPorts, pinConnectionPorts } = sceneConnectionPorts(runtime, harness);
  if (editPinConnections) {
    for (const node of harness.nodes.filter((item) => item.kind === "connector")) {
      const nodePosition = positions.get(node.id);
      const nodeObject = runtime.content.children.find((child) => child.userData.sceneKind === "node" && child.userData.nodeId === node.id);
      if (!nodePosition || !nodeObject) continue;
      const connectedPinIds = new Set(harness.conductors.flatMap((conductor) => {
        const pinId = getConductorPinIdAtNode(conductor, node.id);
        return pinId ? [pinId] : [];
      }));
      for (const pin of node.pins.filter((item) => connectedPinIds.has(item.id))) {
        const position = pinPositions.get(pinConnectionKey(node.id, pin.id))!;
        const offset = position.clone().sub(nodePosition).applyQuaternion(nodeObject.quaternion.clone().invert());
        const handle = new THREE.Group();
        handle.userData = {
          sceneKind: "pinConnection",
          pinConnection: true,
          nodeId: node.id,
          pinId: pin.id,
          nodeOrigin: nodePosition.toArray(),
          connectionOffset: [offset.x, offset.y, offset.z],
        };
        handle.position.copy(position);
        handle.add(new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })));
        const marker = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 10), new THREE.MeshBasicMaterial({ color: 0x18a7d4, depthTest: false, depthWrite: false, transparent: true }));
        marker.renderOrder = 1000;
        handle.add(marker);
        const label = labelSprite(`${node.reference}:${pin.number}`);
        label.position.set(0, 2.4, 0);
        label.scale.set(5, 1.25, 1);
        handle.add(label);
        runtime.content.add(handle);
      }
    }
  }
  for (const segment of harness.segments) {
    const start = positions.get(segment.fromNodeId);
    const end = positions.get(segment.toNodeId);
    if (!start || !end) continue;
    addSegmentVisual(runtime, project, harness, segment, start, end, pinPositions, connectionPorts, pinConnectionPorts, selectedEntityId === segment.id, quality, visibility, coreSeparation, wireThickness, editRoute && selectedEntityId === segment.id);
  }
  addDirectWireVisuals(runtime, project, harness, positions, pinPositions, connectionPorts, pinConnectionPorts, quality, visibility, wireThickness);
  addAccessoryVisuals(runtime, project, harness, positions, visibility);
  runtime.refreshNodeConnections = (nodeId, activePinId) => refreshNodeConnections(runtime, project, harness, nodeId, selectedEntityId, quality, visibility, coreSeparation, wireThickness, activePinId);
}

export function Harness3DView() {
  const { snapshot, activeHarnessId, selectedEntityId, selectedEntityType, selectEntity, updateProject, preferences, setPreferences } = useProjectStore();
  const [libraryParts, setLibraryParts] = useState<PartSnapshot[]>([]);
  const [compactLayout, setCompactLayout] = useState(true);
  const [visibility, setVisibility] = useState<ThreeVisibility>({ housings: true, jackets: true, cores: true, accessories: true, labels: true, grid: true, xray: false });
  const [coreSeparation, setCoreSeparation] = useState(1);
  const [wireThickness, setWireThickness] = useState(0.6);
  const [sceneBrowserOpen, setSceneBrowserOpen] = useState(true);
  const [editRoute, setEditRoute] = useState(false);
  const [editNodeLayout, setEditNodeLayout] = useState(false);
  const [editPartRotation, setEditPartRotation] = useState(false);
  const [editPinConnections, setEditPinConnections] = useState(false);
  const [selectedRoutePoint, setSelectedRoutePoint] = useState<number | null>(null);
  const [activeViewpointId, setActiveViewpointId] = useState("");
  const layoutKeyRef = useRef("");
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void backendInvoke<PartSnapshot[]>("list_library_parts")
      .then((parts) => { if (!cancelled) setLibraryParts(parts); })
      .catch(() => { if (!cancelled) setLibraryParts([]); });
    return () => { cancelled = true; };
  }, []);
  const { hostRef, runtimeRef } = useThreeScene(preferences.threeDQuality, (selection) => {
    if (selection.kind === "node" || selection.kind === "pinConnection") selectEntity(selection.id, "node");
    else if (selection.kind === "accessory") selectEntity(selection.id, "accessory");
    else {
      selectEntity(selection.id, "segment");
      setSelectedRoutePoint(selection.kind === "routePoint" ? selection.routePointIndex ?? null : null);
    }
  }, (segmentId, index, point) => {
    void updateProject((project) => {
      const segment = project.harnesses.find((item) => item.id === activeHarnessId)?.segments.find((item) => item.id === segmentId);
      if (segment?.threeDRoute?.controlPoints[index]) segment.threeDRoute.controlPoints[index] = point;
    });
  }, editNodeLayout, editPartRotation, (nodeId, position) => {
    void updateProject((project) => {
      const node = project.harnesses.find((item) => item.id === activeHarnessId)?.nodes.find((item) => item.id === nodeId);
      if (node) node.threeDPosition = {
        x: Number(position.x.toFixed(2)),
        y: Number(position.y.toFixed(2)),
        z: Number(position.z.toFixed(2)),
      };
    });
  }, (accessoryId, offset) => {
    void updateProject((project) => {
      const accessory = project.harnesses.find((item) => item.id === activeHarnessId)?.accessories.find((item) => item.id === accessoryId);
      if (accessory) accessory.threeDOffset = {
        x: Number(offset.x.toFixed(2)),
        y: Number(offset.y.toFixed(2)),
        z: Number(offset.z.toFixed(2)),
      };
    });
  }, (nodeId, rotation) => {
    void updateProject((project) => {
      const node = project.harnesses.find((item) => item.id === activeHarnessId)?.nodes.find((item) => item.id === nodeId);
      if (node) node.threeDRotation = rotation;
    });
  }, (accessoryId, rotation) => {
    void updateProject((project) => {
      const accessory = project.harnesses.find((item) => item.id === activeHarnessId)?.accessories.find((item) => item.id === accessoryId);
      if (accessory) accessory.threeDRotation = rotation;
    });
  }, (nodeId, pinId, offset) => {
    void updateProject((project) => {
      const pin = project.harnesses.find((item) => item.id === activeHarnessId)?.nodes.find((item) => item.id === nodeId)?.pins.find((item) => item.id === pinId);
      if (pin) pin.threeDConnectionOffset = {
        x: Number(offset.x.toFixed(2)),
        y: Number(offset.y.toFixed(2)),
        z: Number(offset.z.toFixed(2)),
      };
    });
  });
  const harness = snapshot?.project.harnesses.find((item) => item.id === activeHarnessId);
  const renderProject = useMemo(() => snapshot ? {
    ...snapshot.project,
    parts: snapshot.project.parts.map((part) => resolveLibraryModelPlacement(part, libraryParts)),
  } : null, [libraryParts, snapshot]);
  const sceneItems = useMemo(() => renderProject && harness ? buildThreeSceneItems(renderProject, harness) : [], [harness, renderProject]);
  useEffect(() => {
    if (!runtimeRef.current || !renderProject || !harness) return;
    buildHarness(runtimeRef.current, renderProject, harness, selectedEntityId, compactLayout, preferences.threeDQuality, visibility, coreSeparation, wireThickness, editRoute, editPinConnections);
    if (editPartRotation && (selectedEntityType === "node" || selectedEntityType === "accessory")) {
      const selectedPart = runtimeRef.current.content.children.find((child) => selectedEntityType === "node"
        ? child.userData.sceneKind === "node" && child.userData.nodeId === selectedEntityId && child.userData.movable
        : child.userData.sceneKind === "accessory" && child.userData.accessoryId === selectedEntityId);
      if (selectedPart) {
        runtimeRef.current.transform.setMode("rotate");
        runtimeRef.current.transform.attach(selectedPart);
      }
    } else if (editNodeLayout && selectedEntityType === "node") {
      const selectedNode = runtimeRef.current.content.children.find((child) => child.userData.sceneKind === "node" && child.userData.nodeId === selectedEntityId && child.userData.movable);
      if (selectedNode) {
        runtimeRef.current.drag.objects.splice(0, runtimeRef.current.drag.objects.length, selectedNode);
        runtimeRef.current.drag.enabled = true;
      }
    } else if (editNodeLayout && selectedEntityType === "accessory") {
      const selectedAccessory = runtimeRef.current.content.children.find((child) => child.userData.sceneKind === "accessory" && child.userData.accessoryId === selectedEntityId);
      if (selectedAccessory) {
        runtimeRef.current.drag.objects.splice(0, runtimeRef.current.drag.objects.length, selectedAccessory);
        runtimeRef.current.drag.enabled = true;
      }
    }
    const layoutKey = `${harness.id}:${compactLayout}`;
    if (layoutKeyRef.current !== layoutKey) {
      fitCamera(runtimeRef.current);
      layoutKeyRef.current = layoutKey;
    }
  }, [snapshot?.revision, renderProject, harness?.id, selectedEntityId, selectedEntityType, compactLayout, preferences.threeDQuality, visibility, coreSeparation, wireThickness, editRoute, editNodeLayout, editPartRotation, editPinConnections]);
  if (!snapshot || !harness) return <div className="canvas-empty"><Box size={36} /><span>3D로 표시할 하네스를 선택하세요.</span></div>;
  const selectedSegment = selectedEntityType === "segment" ? harness.segments.find((item) => item.id === selectedEntityId) : undefined;
  const selectedNode = selectedEntityType === "node" ? harness.nodes.find((item) => item.id === selectedEntityId) : undefined;
  const selectedAccessory = selectedEntityType === "accessory" ? harness.accessories.find((item) => item.id === selectedEntityId) : undefined;
  const selectedRotation = selectedNode?.threeDRotation ?? selectedAccessory?.threeDRotation ?? { x: 0, y: 0, z: 0 };
  const setSelectedRotation = (rotation: PartRotation) => {
    void updateProject((project) => {
      const activeHarness = project.harnesses.find((item) => item.id === harness.id);
      const node = activeHarness?.nodes.find((item) => item.id === selectedNode?.id);
      const accessory = activeHarness?.accessories.find((item) => item.id === selectedAccessory?.id);
      if (node) node.threeDRotation = rotation;
      if (accessory) accessory.threeDRotation = rotation;
    });
  };
  const updateSelectedRotation = (axis: keyof PartRotation, value: number) => {
    if (Number.isFinite(value)) setSelectedRotation({ ...selectedRotation, [axis]: value });
  };
  const selectSceneItem = (item: ThreeSceneItem) => {
    selectEntity(item.id, item.kind);
    if (runtimeRef.current) focusSceneObject(runtimeRef.current, item.kind, item.id);
  };
  const toggleVisibility = (key: keyof ThreeVisibility) => setVisibility((current) => ({ ...current, [key]: !current[key] }));
  const addRoutePoint = () => {
    if (!selectedSegment) return;
    const count = selectedSegment.threeDRoute?.controlPoints.length ?? 0;
    void updateProject((project) => {
      const segment = project.harnesses.find((item) => item.id === harness.id)?.segments.find((item) => item.id === selectedSegment.id);
      if (!segment) return;
      segment.threeDRoute = { controlPoints: [...(segment.threeDRoute?.controlPoints ?? []), { t: (count + 1) / (count + 2), offsetX: 0, offsetY: 20 }] };
    });
    setEditRoute(true);
    setSelectedRoutePoint(count);
  };
  const toggleRouteEditing = () => {
    setEditNodeLayout(false);
    setEditPartRotation(false);
    setEditPinConnections(false);
    if (!editRoute && !(selectedSegment?.threeDRoute?.controlPoints.length)) {
      addRoutePoint();
      return;
    }
    setEditRoute((current) => !current);
  };
  const deleteRoutePoint = () => {
    if (!selectedSegment || selectedRoutePoint === null) return;
    void updateProject((project) => {
      const segment = project.harnesses.find((item) => item.id === harness.id)?.segments.find((item) => item.id === selectedSegment.id);
      if (!segment?.threeDRoute) return;
      segment.threeDRoute.controlPoints.splice(selectedRoutePoint, 1);
      if (!segment.threeDRoute.controlPoints.length) delete segment.threeDRoute;
    });
    setSelectedRoutePoint(null);
  };
  const resetRoute = () => {
    if (!selectedSegment) return;
    void updateProject((project) => {
      const segment = project.harnesses.find((item) => item.id === harness.id)?.segments.find((item) => item.id === selectedSegment.id);
      if (segment) delete segment.threeDRoute;
    });
    setSelectedRoutePoint(null);
  };
  const saveViewpoint = () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const name = window.prompt("저장할 시점 이름을 입력하세요.", `시점 ${preferences.threeDViewpoints.length + 1}`)?.trim();
    if (!name) return;
    const viewpoint = captureViewpoint(runtime, name);
    setPreferences({ ...preferences, threeDViewpoints: [...preferences.threeDViewpoints, viewpoint] });
    setActiveViewpointId(viewpoint.id);
  };
  const deleteViewpoint = () => {
    if (!activeViewpointId) return;
    setPreferences({ ...preferences, threeDViewpoints: preferences.threeDViewpoints.filter((item) => item.id !== activeViewpointId) });
    setActiveViewpointId("");
  };
  return <div className="harness-3d-view">
    <PanelHeader title={`3D HARNESS · ${harness.number}`} icon={<Box size={14} />} />
    <div className="three-toolbar three-toolbar--primary">
      <span><MousePointer2 size={12} />{editPinConnections ? "핀 접속점을 커넥터 표면에서 드래그 · 빈 공간 회전" : editPartRotation ? "구성 요소 선택 후 XYZ 회전 핸들을 드래그" : editNodeLayout ? "구성 요소 선택 후 좌클릭 드래그 · 빈 공간 회전" : "선택 · 좌클릭 회전 · 우클릭 이동"}</span>
      <button className={editNodeLayout ? "active" : ""} disabled={harness.releaseStatus === "released"} onClick={() => {
        setEditNodeLayout((current) => !current);
        setEditPartRotation(false);
        setEditPinConnections(false);
        setEditRoute(false);
        setSelectedRoutePoint(null);
      }}><Move3D size={12} />배치 편집</button>
      <button className={editPartRotation ? "active" : ""} disabled={harness.releaseStatus === "released"} onClick={() => {
        setEditPartRotation((current) => !current);
        setEditNodeLayout(false);
        setEditPinConnections(false);
        setEditRoute(false);
        setSelectedRoutePoint(null);
      }}><Rotate3D size={12} />회전 편집</button>
      <button className={editPinConnections ? "active" : ""} disabled={harness.releaseStatus === "released"} onClick={() => {
        setEditPinConnections((current) => !current);
        setEditNodeLayout(false);
        setEditPartRotation(false);
        setEditRoute(false);
        setSelectedRoutePoint(null);
      }}><Crosshair size={12} />핀 접속점</button>
      <button className={compactLayout ? "active" : ""} onClick={() => setCompactLayout((current) => !current)}><Waves size={12} />{compactLayout ? "컴팩트" : "실제 길이"}</button>
      <button className={sceneBrowserOpen ? "active" : ""} onClick={() => setSceneBrowserOpen((current) => !current)}><ListTree size={12} />구성</button>
      <button onClick={() => runtimeRef.current && fitCamera(runtimeRef.current)}><Focus size={12} />전체</button>
      <button title="등각" onClick={() => runtimeRef.current && setStandardView(runtimeRef.current, "iso")}><BoxSelect size={12} />ISO</button>
      <button onClick={() => runtimeRef.current && setStandardView(runtimeRef.current, "front")}>정면</button>
      <button onClick={() => runtimeRef.current && setStandardView(runtimeRef.current, "top")}>평면</button>
      <button onClick={() => runtimeRef.current && setStandardView(runtimeRef.current, "right")}>우측</button>
      <select aria-label="저장된 3D 시점" value={activeViewpointId} onChange={(event) => {
        setActiveViewpointId(event.target.value);
        const viewpoint = preferences.threeDViewpoints.find((item) => item.id === event.target.value);
        if (runtimeRef.current && viewpoint) restoreViewpoint(runtimeRef.current, viewpoint);
      }}><option value="">사용자 시점</option>{preferences.threeDViewpoints.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <button title="현재 시점 저장" onClick={saveViewpoint}><Save size={12} /></button>
      <button title="선택 시점 삭제" disabled={!activeViewpointId} onClick={deleteViewpoint}><Trash2 size={12} /></button>
      <button onClick={() => window.dispatchEvent(new Event("harness-cad-export"))}><Download size={12} />3D CAD</button>
    </div>
    <div className="three-toolbar three-toolbar--display">
      {(["housings", "jackets", "cores", "accessories", "labels", "grid"] as const).map((key) => <button key={key} className={visibility[key] ? "active" : ""} onClick={() => toggleVisibility(key)}>{visibility[key] ? <Eye size={11} /> : <EyeOff size={11} />}{key === "housings" ? "하우징" : key === "jackets" ? "외피" : key === "cores" ? "코어" : key === "accessories" ? "부자재" : key === "labels" ? "표기" : "그리드"}</button>)}
      <button className={visibility.xray ? "active" : ""} onClick={() => toggleVisibility("xray")}><ScanLine size={11} />X-RAY</button>
      <label>코어 분리 <input aria-label="코어 분리" type="range" min="1" max="4" step="0.5" value={coreSeparation} onChange={(event) => setCoreSeparation(Number(event.target.value))} /><b>{coreSeparation.toFixed(1)}×</b></label>
      <label>선 굵기 <input aria-label="선 굵기" type="range" min="0.3" max="1" step="0.1" value={wireThickness} onChange={(event) => setWireThickness(Number(event.target.value))} /><b>{wireThickness.toFixed(1)}×</b></label>
      <span className="three-legend"><i className="housing" />하우징<i className="jacket" />외피<i className="core" />코어<i className="accessory" />부자재</span>
    </div>
    <div className="three-toolbar three-toolbar--shape">
      <span><Move3D size={12} />형상 편집</span>
      <strong>{editPartRotation ? selectedNode?.reference ?? (selectedAccessory ? "부자재" : "구성 요소를 선택하세요") : selectedSegment ? selectedSegment.label : "케이블을 선택하세요"}</strong>
      <button className={editRoute ? "active" : ""} disabled={!selectedSegment} onClick={toggleRouteEditing}><Rotate3D size={12} />제어점</button>
      <button disabled={!selectedSegment} onClick={addRoutePoint}><Plus size={12} />추가</button>
      <button disabled={selectedRoutePoint === null} onClick={deleteRoutePoint}><Trash2 size={12} />삭제</button>
      <button disabled={!selectedSegment?.threeDRoute} onClick={resetRoute}>자동 형상</button>
      {editPartRotation && (selectedNode || selectedAccessory) && <div className="three-rotation-fields">
        {(["x", "y", "z"] as const).map((axis) => <label key={axis}>{axis.toUpperCase()}<input aria-label={`${axis.toUpperCase()}축 회전`} type="number" step="5" value={selectedRotation[axis]} onChange={(event) => updateSelectedRotation(axis, Number(event.target.value))} />°</label>)}
        <button onClick={() => setSelectedRotation({ x: 0, y: 0, z: 0 })}><RotateCcw size={11} />0°</button>
      </div>}
      {editNodeLayout && <em>구성 요소를 선택한 뒤 본체를 왼쪽 버튼으로 드래그하면 연결된 선이 함께 이동합니다.</em>}
      {editPartRotation && <em>구성 요소를 선택한 뒤 빨강(X)·초록(Y)·파랑(Z) 회전 링을 드래그하세요.</em>}
      {editPinConnections && <em>청록색 핀 접속점을 커넥터 STEP/도형 표면 위로 드래그하면 해당 핀의 선만 따라옵니다.</em>}
      {editRoute && selectedSegment && <em>청록색 제어점을 선택한 뒤 축 핸들을 드래그하세요.</em>}
    </div>
    <div className="three-viewport" ref={hostRef}>
      {sceneBrowserOpen && <aside className="three-scene-browser">
        <header><ListTree size={13} /><strong>SCENE</strong><span>{sceneItems.length}</span></header>
        {(["node", "segment", "accessory"] as const).map((kind) => <section key={kind}>
          <h3>{kind === "node" ? "HOUSINGS" : kind === "segment" ? "CABLES" : "ACCESSORIES"}</h3>
          {sceneItems.filter((item) => item.kind === kind).map((item) => <button key={item.id} className={selectedEntityId === item.id ? "active" : ""} onClick={() => selectSceneItem(item)} title="선택 및 화면 맞춤">
            <span><strong>{item.reference}</strong><small>{item.detail}</small></span><Focus size={11} />
          </button>)}
        </section>)}
      </aside>}
    </div>
  </div>;
}

export function Part3DPreview({ asset, placement, showCable = false, onPlacementChange, pinNumbers = [], selectedPinNumber, placingPinPort = false, rotatingConnector = false, onPinPortPlaced }: { asset: ModelAsset | null; placement?: ModelPlacement; showCable?: boolean; onPlacementChange?: (placement: ModelPlacement) => void; pinNumbers?: string[]; selectedPinNumber?: string; placingPinPort?: boolean; rotatingConnector?: boolean; onPinPortPlaced?: () => void }) {
  const quality = useProjectStore((state) => state.preferences.threeDQuality);
  const { hostRef, runtimeRef } = useThreeScene(quality);
  const fittedAssetIdRef = useRef<string | null>(null);
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    disposeObject(runtime.content);
    runtime.content.clear();
    if (!asset) fittedAssetIdRef.current = null;
    if (asset) {
      if (showCable) {
        const resolvedPlacement = placement ?? defaultModelPlacement;
        const activePinNumber = selectedPinNumber ?? pinNumbers[0];
        const activePinPort = activePinNumber ? getModelPinPort(resolvedPlacement, activePinNumber) : null;
        const fallbackDirection = modelInletDirection(resolvedPlacement);
        const activeDirection = activePinPort ? modelPinPortDirection(activePinPort, fallbackDirection) : fallbackDirection;
        const direction = new THREE.Vector3(activeDirection.x, activeDirection.y, activeDirection.z);
        const portPosition = activePinPort
          ? new THREE.Vector3(activePinPort.offsetX, activePinPort.offsetY, activePinPort.offsetZ)
          : new THREE.Vector3();
        const connector = placeConnectorVisual(modelGroup(asset, false, undefined, resolvedPlacement.scale), resolvedPlacement);
        const rotationTarget = connector.getObjectByName("model-placement-rotation");
        const port = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 10), new THREE.MeshBasicMaterial({ color: 0x18a7d4, depthTest: false }));
        port.position.copy(portPosition);
        port.renderOrder = 1000;
        const portHitTarget = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        portHitTarget.position.copy(portPosition);
        const arrow = new THREE.ArrowHelper(direction, portPosition, 18, 0x18a7d4, 4, 2.5);
        const directionHandle = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 10), new THREE.MeshBasicMaterial({ color: 0x18a7d4, transparent: true, opacity: 0.7, depthTest: false }));
        directionHandle.position.copy(portPosition).addScaledVector(direction, 18);
        directionHandle.userData.inletDirectionHandle = true;
        directionHandle.renderOrder = 1000;
        const directionHitTarget = new THREE.Mesh(new THREE.SphereGeometry(4.5, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        directionHitTarget.position.copy(directionHandle.position);
        const inactivePorts = pinNumbers.filter((pinNumber) => pinNumber !== activePinNumber).map((pinNumber) => {
          const pinPort = getModelPinPort(resolvedPlacement, pinNumber);
          const marker = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf0a53b, depthTest: false }));
          marker.position.set(pinPort.offsetX, pinPort.offsetY, pinPort.offsetZ);
          marker.renderOrder = 999;
          return marker;
        });
        runtime.content.add(connector, ...inactivePorts, port, portHitTarget, arrow, directionHandle, directionHitTarget, new THREE.AxesHelper(12));
        if (onPlacementChange) {
          const canvas = runtime.renderer.domElement;
          canvas.style.cursor = placingPinPort ? "crosshair" : "";
          const raycaster = new THREE.Raycaster();
          const pointer = new THREE.Vector2();
          let draggingPointerId: number | null = null;
          let draggingTarget: "port" | "direction" | null = null;
          let suppressClick = false;
          let draggedDirection = direction.clone();
          const setPointer = (event: PointerEvent) => {
            const bounds = canvas.getBoundingClientRect();
            pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
            raycaster.setFromCamera(pointer, runtime.camera);
          };
          const connectorSurface = () => raycaster.intersectObject(connector, true).find((item) => item.object instanceof THREE.Mesh);
          const surfaceDirection = (hit: THREE.Intersection) => hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).normalize() ?? null;
          const updatePortVisual = (position: THREE.Vector3, nextDirection: THREE.Vector3) => {
            portPosition.copy(position);
            draggedDirection.copy(nextDirection);
            port.position.copy(portPosition);
            portHitTarget.position.copy(portPosition);
            arrow.position.copy(portPosition);
            arrow.setDirection(draggedDirection);
            directionHandle.position.copy(portPosition).addScaledVector(draggedDirection, 18);
            directionHitTarget.position.copy(directionHandle.position);
          };
          const pointerDown = (event: PointerEvent) => {
            if (event.button !== 0 || rotatingConnector) return;
            setPointer(event);
            draggingTarget = raycaster.intersectObject(portHitTarget, false).length
              ? "port"
              : raycaster.intersectObject(directionHitTarget, false).length ? "direction" : null;
            if (!draggingTarget) return;
            draggingPointerId = event.pointerId;
            suppressClick = true;
            runtime.controls.enabled = false;
            canvas.setPointerCapture(event.pointerId);
            event.preventDefault();
            event.stopImmediatePropagation();
          };
          const pointerMove = (event: PointerEvent) => {
            if (draggingPointerId !== event.pointerId) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            setPointer(event);
            if (draggingTarget === "port") {
              const hit = connectorSurface();
              if (!hit) return;
              updatePortVisual(hit.point, surfaceDirection(hit) ?? draggedDirection);
              return;
            }
            const cameraDirection = runtime.camera.getWorldDirection(new THREE.Vector3());
            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(cameraDirection, portPosition);
            const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
            if (!point) return;
            const relative = point.sub(portPosition);
            if (relative.lengthSq() < 0.000001) return;
            draggedDirection = relative.normalize();
            arrow.setDirection(draggedDirection);
            directionHandle.position.copy(portPosition).addScaledVector(draggedDirection, 18);
            directionHitTarget.position.copy(directionHandle.position);
          };
          const pointerUp = (event: PointerEvent) => {
            if (draggingPointerId !== event.pointerId) return;
            draggingPointerId = null;
            const committedTarget = draggingTarget;
            draggingTarget = null;
            runtime.controls.enabled = true;
            if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
            event.preventDefault();
            event.stopImmediatePropagation();
            onPlacementChange(activePinPort
              ? setModelPinPort(resolvedPlacement, {
                ...activePinPort,
                offsetX: portPosition.x,
                offsetY: portPosition.y,
                offsetZ: portPosition.z,
                directionX: draggedDirection.x,
                directionY: draggedDirection.y,
                directionZ: draggedDirection.z,
              })
              : {
                ...resolvedPlacement,
                offsetX: portPosition.x,
                offsetY: portPosition.y,
                offsetZ: portPosition.z,
                inletDirectionX: draggedDirection.x,
                inletDirectionY: draggedDirection.y,
                inletDirectionZ: draggedDirection.z,
              });
            if (committedTarget === "port") onPinPortPlaced?.();
          };
          const click = (event: MouseEvent) => {
            if (suppressClick) {
              suppressClick = false;
              return;
            }
            if (!placingPinPort && !event.shiftKey) return;
            const bounds = canvas.getBoundingClientRect();
            pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
            raycaster.setFromCamera(pointer, runtime.camera);
            const hit = connectorSurface();
            if (!hit) return;
            const nextDirection = surfaceDirection(hit) ?? draggedDirection;
            onPlacementChange(activePinPort
              ? setModelPinPort(resolvedPlacement, { ...activePinPort, offsetX: hit.point.x, offsetY: hit.point.y, offsetZ: hit.point.z, directionX: nextDirection.x, directionY: nextDirection.y, directionZ: nextDirection.z })
              : { ...resolvedPlacement, offsetX: hit.point.x, offsetY: hit.point.y, offsetZ: hit.point.z, inletDirectionX: nextDirection.x, inletDirectionY: nextDirection.y, inletDirectionZ: nextDirection.z });
            onPinPortPlaced?.();
          };
          const handleTransformDrag = (event: { value: unknown }) => { runtime.controls.enabled = !Boolean(event.value); };
          const handleRotationCommit = () => {
            if (!rotatingConnector || !rotationTarget) return;
            const rotation = partRotationDegrees(rotationTarget);
            onPlacementChange(rotateModelPinPorts(resolvedPlacement, rotation));
          };
          if (rotatingConnector && rotationTarget) {
            runtime.transform.setMode("rotate");
            runtime.transform.setSpace("local");
            runtime.transform.setSize(0.75);
            runtime.transform.attach(rotationTarget);
          }
          runtime.transform.addEventListener("dragging-changed", handleTransformDrag);
          runtime.transform.addEventListener("mouseUp", handleRotationCommit);
          canvas.addEventListener("pointerdown", pointerDown, true);
          canvas.addEventListener("pointermove", pointerMove, true);
          canvas.addEventListener("pointerup", pointerUp, true);
          canvas.addEventListener("click", click);
          if (fittedAssetIdRef.current !== asset.id) {
            fitCamera(runtime);
            fittedAssetIdRef.current = asset.id;
          }
          return () => {
            canvas.style.cursor = "";
            runtime.transform.removeEventListener("dragging-changed", handleTransformDrag);
            runtime.transform.removeEventListener("mouseUp", handleRotationCommit);
            if (runtime.transform.object === rotationTarget) runtime.transform.detach();
            canvas.removeEventListener("pointerdown", pointerDown, true);
            canvas.removeEventListener("pointermove", pointerMove, true);
            canvas.removeEventListener("pointerup", pointerUp, true);
            canvas.removeEventListener("click", click);
          };
        }
      } else {
        runtime.content.add(modelGroup(asset, false, 40));
      }
      if (fittedAssetIdRef.current !== asset.id) {
        fitCamera(runtime);
        fittedAssetIdRef.current = asset.id;
      }
    }
  }, [asset, onPinPortPlaced, onPlacementChange, pinNumbers, placement, placingPinPort, rotatingConnector, runtimeRef, selectedPinNumber, showCable]);
  return <div className="part-3d-preview" ref={hostRef}>{!asset && <span>STEP 파일을 선택하면 3D 형상이 표시됩니다.</span>}</div>;
}
