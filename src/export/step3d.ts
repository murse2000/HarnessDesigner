import * as THREE from "three";
import type { HarnessAssembly, ModelAsset, ModelMesh, PartSnapshot, ProjectDocument } from "../domain/types";
import { getCableRenderSpec, getCoreOffsets, getHeatShrinkRenderSpec, getHeatShrinkSpan } from "../three/cableRendering";
import { getCompactCoilLayout, layoutHarnessNodes, positionHarnessRoutePoint, type HarnessPoint3 } from "../three/harnessLayout";
import { defaultModelPlacement, getModelPlacement, modelInletDirection, type ModelPlacement } from "../three/modelPlacement";
import { buildInletCurve } from "../three/pinConnections";

export interface CadRoute {
  id: string;
  reference: string;
  lengthMm: number;
  fromNodeId: string;
  toNodeId: string;
  points: HarnessPoint3[];
}

export interface HarnessCadData {
  meshes: CadMesh[];
  nodePositions: Map<string, HarnessPoint3>;
  routes: CadRoute[];
}

interface CadMesh {
  name: string;
  positions: number[];
  indices: number[];
}

const radialSegments = 12;

function safeName(value: string) {
  return value.trim().replaceAll(/[^a-zA-Z0-9가-힣_.-]/g, "_") || "ITEM";
}

function stepText(value: string) {
  return value.replaceAll("'", "''");
}

function inletDirectionVector(placement: ModelPlacement) {
  const direction = modelInletDirection(placement);
  return new THREE.Vector3(direction.x, direction.y, direction.z);
}

function meshGeometry(mesh: ModelMesh) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
  geometry.setIndex(mesh.indices);
  return geometry;
}

function modelGroup(asset: ModelAsset, scaleMultiplier: number) {
  const group = new THREE.Group();
  for (const mesh of asset.meshes) group.add(new THREE.Mesh(meshGeometry(mesh)));
  const bounds = new THREE.Box3().setFromObject(group);
  if (!bounds.isEmpty()) {
    const center = bounds.getCenter(new THREE.Vector3());
    group.scale.setScalar(scaleMultiplier);
    group.position.copy(center.multiplyScalar(-scaleMultiplier));
  }
  return group;
}

function placeConnectorVisual(visual: THREE.Object3D, placement: ModelPlacement) {
  const direction = inletDirectionVector(placement);
  const size = new THREE.Box3().setFromObject(visual, true).getSize(new THREE.Vector3());
  const halfExtent = Math.abs(direction.x) * size.x / 2 + Math.abs(direction.y) * size.y / 2 + Math.abs(direction.z) * size.z / 2;
  visual.position.sub(direction.clone().multiplyScalar(halfExtent).add(new THREE.Vector3(placement.offsetX, placement.offsetY, placement.offsetZ)));
  const root = new THREE.Group();
  const roll = new THREE.Quaternion().setFromAxisAngle(direction, THREE.MathUtils.degToRad(placement.rollDeg));
  root.quaternion.copy(roll);
  root.add(visual);
  return root;
}

function geometryMesh(name: string, geometry: THREE.BufferGeometry, matrix = new THREE.Matrix4()): CadMesh {
  const position = geometry.getAttribute("position");
  const positions: number[] = [];
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index).applyMatrix4(matrix);
    positions.push(point.x, point.y, point.z);
  }
  const indices = geometry.getIndex()?.array ? Array.from(geometry.getIndex()!.array, Number) : Array.from({ length: position.count }, (_, index) => index);
  return { name: safeName(name), positions, indices };
}

function objectMeshes(root: THREE.Object3D, name: string) {
  root.updateMatrixWorld(true);
  const meshes: CadMesh[] = [];
  let index = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.BufferGeometry)) return;
    meshes.push(geometryMesh(`${name}_${index + 1}`, object.geometry, object.matrixWorld));
    index += 1;
  });
  return meshes;
}

type ConnectionPort = { direction: THREE.Vector3; straightLeadMm: number };

function segmentCurve(start: THREE.Vector3, end: THREE.Vector3, cableLengthMm: number, route: HarnessAssembly["segments"][number]["threeDRoute"], startPort?: ConnectionPort, endPort?: ConnectionPort) {
  if (route?.controlPoints.length) {
    const points = [...route.controlPoints].sort((left, right) => left.t - right.t).map((point) => {
      const position = positionHarnessRoutePoint(start, end, point);
      return new THREE.Vector3(position.x, position.y, position.z);
    });
    return buildInletCurve(start, end, startPort?.direction, endPort?.direction, startPort?.straightLeadMm, endPort?.straightLeadMm, points);
  }
  const axis = end.clone().sub(start);
  const coil = getCompactCoilLayout(cableLengthMm, axis.length());
  if (!coil) return buildInletCurve(start, end, startPort?.direction, endPort?.direction, startPort?.straightLeadMm, endPort?.straightLeadMm);
  const direction = axis.clone().normalize();
  const reference = Math.abs(direction.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const basisX = new THREE.Vector3().crossVectors(direction, reference).normalize();
  const basisY = new THREE.Vector3().crossVectors(direction, basisX).normalize();
  const samples = Math.max(48, coil.turns * 24);
  const points = Array.from({ length: samples + 1 }, (_, index) => {
    const ratio = index / samples;
    const angle = ratio * coil.turns * Math.PI * 2;
    return start.clone().lerp(end, ratio)
      .addScaledVector(basisX, coil.radiusMm * (Math.cos(angle) - 1))
      .addScaledVector(basisY, coil.radiusMm * Math.sin(angle));
  });
  return buildInletCurve(start, end, startPort?.direction, endPort?.direction, startPort?.straightLeadMm, endPort?.straightLeadMm, points.slice(1, -1));
}

function routePoints(curve: THREE.Curve<THREE.Vector3>, count = 24): HarnessPoint3[] {
  return Array.from({ length: count + 1 }, (_, index) => {
    const point = curve.getPointAt(index / count);
    return { x: point.x, y: point.y, z: point.z };
  });
}

function closedTube(name: string, curve: THREE.Curve<THREE.Vector3>, startRatio: number, endRatio: number, radius: number, offset?: { x: number; y: number }, offsetStart = 1, offsetEnd = 1) {
  if (endRatio - startRatio < 0.0001 || radius <= 0) return null;
  const lengthSegments = Math.max(8, Math.min(160, Math.ceil(curve.getLength() * (endRatio - startRatio) / 12)));
  const sampled = Array.from({ length: lengthSegments + 1 }, (_, index) => curve.getPointAt(startRatio + (endRatio - startRatio) * index / lengthSegments));
  const slice = new THREE.CatmullRomCurve3(sampled, false, "centripetal");
  const frames = slice.computeFrenetFrames(lengthSegments, false);
  const positions: number[] = [];
  for (let ring = 0; ring <= lengthSegments; ring += 1) {
    const center = slice.getPointAt(ring / lengthSegments);
    const scale = offsetStart + (offsetEnd - offsetStart) * ring / lengthSegments;
    if (offset) center.addScaledVector(frames.normals[ring], offset.x * scale).addScaledVector(frames.binormals[ring], offset.y * scale);
    for (let side = 0; side < radialSegments; side += 1) {
      const angle = side / radialSegments * Math.PI * 2;
      const point = center.clone().addScaledVector(frames.normals[ring], Math.cos(angle) * radius).addScaledVector(frames.binormals[ring], Math.sin(angle) * radius);
      positions.push(point.x, point.y, point.z);
    }
  }
  const indices: number[] = [];
  for (let ring = 0; ring < lengthSegments; ring += 1) {
    for (let side = 0; side < radialSegments; side += 1) {
      const next = (side + 1) % radialSegments;
      const a = ring * radialSegments + side;
      const b = ring * radialSegments + next;
      const c = (ring + 1) * radialSegments + next;
      const d = (ring + 1) * radialSegments + side;
      indices.push(a, b, d, b, c, d);
    }
  }
  const startCenter = positions.length / 3;
  const start = slice.getPointAt(0);
  positions.push(start.x, start.y, start.z);
  const endCenter = positions.length / 3;
  const end = slice.getPointAt(1);
  positions.push(end.x, end.y, end.z);
  for (let side = 0; side < radialSegments; side += 1) {
    const next = (side + 1) % radialSegments;
    indices.push(startCenter, next, side);
    const last = lengthSegments * radialSegments;
    indices.push(endCenter, last + side, last + next);
  }
  return { name: safeName(name), positions, indices } satisfies CadMesh;
}

function wireDiameter(part: PartSnapshot | undefined) {
  const value = Number(part?.attributes.outerDiameterMm);
  return Number.isFinite(value) && value > 0 ? value : 2.2;
}

function addSegmentMeshes(meshes: CadMesh[], project: ProjectDocument, harness: HarnessAssembly, segment: HarnessAssembly["segments"][number], curve: THREE.Curve<THREE.Vector3>) {
  const conductors = harness.conductors.filter((conductor) => conductor.routeSegmentIds.includes(segment.id));
  const cablePart = project.parts.find((part) => part.id === segment.cablePartId);
  const spec = getCableRenderSpec(cablePart);
  if (!spec) {
    if (!conductors.length) {
      const tube = closedTube(segment.label, curve, 0, 1, 1.15);
      if (tube) meshes.push(tube);
      return;
    }
    const maximumDiameter = Math.max(...conductors.map((conductor) => wireDiameter(project.parts.find((part) => part.id === conductor.wirePartId))));
    const offsets = getCoreOffsets(conductors.length, maximumDiameter * Math.max(conductors.length, 2), maximumDiameter);
    conductors.forEach((conductor, index) => {
      const tube = closedTube(`${segment.label}_${conductor.reference}`, curve, 0, 1, wireDiameter(project.parts.find((part) => part.id === conductor.wirePartId)) / 2, offsets[index]);
      if (tube) meshes.push(tube);
    });
    return;
  }
  const breakout = Math.min(spec.breakoutLengthMm, segment.lengthMm / 2);
  const startRatio = segment.lengthMm > 0 ? breakout / segment.lengthMm : 0;
  const endRatio = 1 - startRatio;
  const jacket = closedTube(`${segment.label}_JACKET`, curve, startRatio, endRatio, spec.outerDiameterMm / 2);
  if (jacket) meshes.push(jacket);
  if (spec.construction === "shieldedMultiCore" || segment.shieldPartId) {
    const shield = closedTube(`${segment.label}_SHIELD`, curve, startRatio, endRatio, spec.outerDiameterMm * 0.43);
    if (shield) meshes.push(shield);
  }
  const offsets = getCoreOffsets(conductors.length, spec.outerDiameterMm, spec.coreDiameterMm);
  conductors.forEach((conductor, index) => {
    const startCore = closedTube(`${segment.label}_${conductor.reference}_A`, curve, 0, startRatio, spec.coreDiameterMm / 2, offsets[index], 0, 1);
    const endCore = closedTube(`${segment.label}_${conductor.reference}_B`, curve, endRatio, 1, spec.coreDiameterMm / 2, offsets[index], 1, 0);
    if (startCore) meshes.push(startCore);
    if (endCore) meshes.push(endCore);
  });
  if (segment.sleevePartId) {
    const sleeve = closedTube(`${segment.label}_SLEEVE`, curve, startRatio, endRatio, spec.outerDiameterMm / 2 + 0.45);
    if (sleeve) meshes.push(sleeve);
  }
  if (segment.tapePartId) {
    const tape = closedTube(`${segment.label}_TAPE`, curve, 0.42, 0.58, spec.outerDiameterMm / 2 + 0.7);
    if (tape) meshes.push(tape);
  }
  for (const [suffix, partId, centerMm] of [["START", segment.startHeatShrinkPartId, breakout], ["END", segment.endHeatShrinkPartId, segment.lengthMm - breakout]] as const) {
    const heatShrink = getHeatShrinkRenderSpec(project.parts.find((part) => part.id === partId));
    if (!heatShrink || segment.lengthMm <= 0) continue;
    const span = getHeatShrinkSpan(segment.lengthMm, centerMm, heatShrink.lengthMm);
    const tube = closedTube(`${segment.label}_HEAT_SHRINK_${suffix}`, curve, span.startMm / segment.lengthMm, span.endMm / segment.lengthMm, heatShrink.finishedDiameterMm / 2);
    if (tube) meshes.push(tube);
  }
}

export function buildHarnessCadData(project: ProjectDocument, harness: HarnessAssembly): HarnessCadData {
  const nodePositions = layoutHarnessNodes(harness);
  const meshes: CadMesh[] = [];
  const routes: CadRoute[] = [];
  const connectionPorts = new Map(harness.nodes.flatMap((node) => {
    if (node.kind !== "connector") return [];
    const part = project.parts.find((item) => item.id === node.partId);
    const placement = getModelPlacement(part);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(node.threeDRotation?.x ?? 0),
      THREE.MathUtils.degToRad(node.threeDRotation?.y ?? 0),
      THREE.MathUtils.degToRad(node.threeDRotation?.z ?? 0),
    ));
    return [[node.id, { direction: inletDirectionVector(placement).applyQuaternion(rotation).normalize(), straightLeadMm: placement.straightLeadMm }] as const];
  }));
  for (const segment of harness.segments) {
    const from = nodePositions.get(segment.fromNodeId);
    const to = nodePositions.get(segment.toNodeId);
    if (!from || !to || segment.lengthMm <= 0) continue;
    const curve = segmentCurve(new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(to.x, to.y, to.z), segment.lengthMm, segment.threeDRoute, connectionPorts.get(segment.fromNodeId), connectionPorts.get(segment.toNodeId));
    addSegmentMeshes(meshes, project, harness, segment, curve);
    routes.push({ id: segment.id, reference: segment.label, lengthMm: segment.lengthMm, fromNodeId: segment.fromNodeId, toNodeId: segment.toNodeId, points: routePoints(curve) });
  }
  for (const node of harness.nodes) {
    const position = nodePositions.get(node.id);
    if (!position) continue;
    const part = project.parts.find((item) => item.id === node.partId);
    const asset = project.modelAssets.find((item) => item.id === part?.modelAssetId);
    const placement = asset ? getModelPlacement(part) : defaultModelPlacement;
    const visual = asset?.meshes.length ? modelGroup(asset, placement.scale) : node.kind === "connector"
      ? new THREE.Mesh(new THREE.BoxGeometry(14, 8, 10))
      : new THREE.Mesh(new THREE.SphereGeometry(4.5, 12, 8));
    const visualRoot = node.kind === "connector" ? placeConnectorVisual(visual, placement) : visual;
    const root = new THREE.Group();
    root.position.set(position.x, position.y, position.z);
    root.rotation.set(
      THREE.MathUtils.degToRad(node.threeDRotation?.x ?? 0),
      THREE.MathUtils.degToRad(node.threeDRotation?.y ?? 0),
      THREE.MathUtils.degToRad(node.threeDRotation?.z ?? 0),
    );
    root.add(visualRoot);
    meshes.push(...objectMeshes(root, `${node.reference}_${part?.partNumber ?? node.kind}`));
  }
  const fallbackPosition = nodePositions.values().next().value as HarnessPoint3 | undefined;
  harness.accessories.forEach((accessory, index) => {
    const part = project.parts.find((item) => item.id === accessory.partId);
    if (!part) return;
    const nodePosition = accessory.nodeId ? nodePositions.get(accessory.nodeId) : undefined;
    const segment = harness.segments.find((item) => item.id === accessory.segmentId);
    const segmentStart = segment ? nodePositions.get(segment.fromNodeId) : undefined;
    const segmentEnd = segment ? nodePositions.get(segment.toNodeId) : undefined;
    const position = nodePosition
      ? new THREE.Vector3(nodePosition.x, nodePosition.y, nodePosition.z + 16)
      : segmentStart && segmentEnd
        ? new THREE.Vector3(segmentStart.x, segmentStart.y, segmentStart.z).lerp(new THREE.Vector3(segmentEnd.x, segmentEnd.y, segmentEnd.z), 0.5)
        : fallbackPosition
          ? new THREE.Vector3(fallbackPosition.x + index * 14, fallbackPosition.y + 12, fallbackPosition.z + 18)
          : null;
    if (!position) return;
    const asset = project.modelAssets.find((item) => item.id === part.modelAssetId);
    let visual: THREE.Object3D;
    if (asset?.meshes.length) visual = modelGroup(asset, getModelPlacement(part).scale);
    else if (part.category === "clip") visual = new THREE.Mesh(new THREE.TorusGeometry(6, 1.4, 8, 20));
    else if (part.category === "label") visual = new THREE.Mesh(new THREE.BoxGeometry(18, 1.2, 8));
    else if (part.category === "lug" || part.category === "terminal" || part.category === "seal") visual = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 8, 12));
    else visual = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 8));
    visual.position.copy(position);
    meshes.push(...objectMeshes(visual, `${part.category}_${part.partNumber}_${index + 1}`));
  });
  return { meshes, nodePositions, routes };
}

function meshIsClosed(mesh: CadMesh) {
  const edges = new Map<string, number>();
  for (let index = 0; index + 2 < mesh.indices.length; index += 3) {
    const triangle = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const pair = [triangle[edge], triangle[(edge + 1) % 3]].sort((left, right) => left - right);
      const key = `${pair[0]}:${pair[1]}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  return edges.size > 0 && [...edges.values()].every((count) => count === 2);
}

function mergeCoincidentVertices(mesh: CadMesh) {
  const positions: number[] = [];
  const indices: number[] = [];
  const vertexByPosition = new Map<string, number>();
  for (const sourceIndex of mesh.indices) {
    const offset = sourceIndex * 3;
    const coordinates = mesh.positions.slice(offset, offset + 3);
    if (coordinates.length !== 3 || coordinates.some((value) => !Number.isFinite(value))) continue;
    const key = coordinates.map((value) => value.toFixed(6)).join(":");
    let targetIndex = vertexByPosition.get(key);
    if (targetIndex === undefined) {
      targetIndex = positions.length / 3;
      vertexByPosition.set(key, targetIndex);
      positions.push(...coordinates);
    }
    indices.push(targetIndex);
  }
  return { ...mesh, positions, indices };
}

export function buildHarnessStep(project: ProjectDocument, harness: HarnessAssembly) {
  const meshes = buildHarnessCadData(project, harness).meshes.map(mergeCoincidentVertices);
  if (!meshes.length) throw new Error("STEP으로 내보낼 3D 형상이 없습니다.");
  const entities: string[] = [];
  const add = (value: string) => { entities.push(value); return entities.length; };
  const application = add("APPLICATION_CONTEXT('Core Data for Automotive Mechanical Design Process')");
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2009,#${application})`);
  const productContext = add(`PRODUCT_CONTEXT('part definition',#${application},'mechanical')`);
  const product = add(`PRODUCT('${stepText(project.projectNumber)}','${stepText(harness.number)}','${stepText(harness.name)}',(#${productContext}))`);
  add(`PRODUCT_RELATED_PRODUCT_CATEGORY('${stepText(harness.number)}','${stepText(harness.name)}',(#${product}))`);
  const formation = add(`PRODUCT_DEFINITION_FORMATION('','',#${product})`);
  const definitionContext = add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${application},'design')`);
  const definition = add(`PRODUCT_DEFINITION('design','',#${formation},#${definitionContext})`);
  const productShape = add(`PRODUCT_DEFINITION_SHAPE('','',#${definition})`);
  const lengthUnit = add("(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))");
  const angleUnit = add("(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))");
  const solidAngleUnit = add("(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())");
  const uncertainty = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-6),#${lengthUnit},'distance_accuracy_value','confusion accuracy')`);
  const context = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${uncertainty})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lengthUnit},#${angleUnit},#${solidAngleUnit})) REPRESENTATION_CONTEXT('',''))`);
  const origin = add("CARTESIAN_POINT('',(0.,0.,0.))");
  const zDirection = add("DIRECTION('',(0.,0.,1.))");
  const xDirection = add("DIRECTION('',(1.,0.,0.))");
  const axis = add(`AXIS2_PLACEMENT_3D('',#${origin},#${zDirection},#${xDirection})`);
  const closedItems: number[] = [];
  const openItems: number[] = [];
  for (const mesh of meshes) {
    const pointIds: number[] = [];
    for (let index = 0; index + 2 < mesh.positions.length; index += 3) {
      const values = mesh.positions.slice(index, index + 3).map((value) => Number.isFinite(value) ? value.toFixed(6) : "0.");
      pointIds.push(add(`CARTESIAN_POINT('',(${values.join(",")}))`));
    }
    const faceIds: number[] = [];
    for (let index = 0; index + 2 < mesh.indices.length; index += 3) {
      const vertexIndices = mesh.indices.slice(index, index + 3);
      const vertices = vertexIndices.map((vertex) => pointIds[vertex]).filter(Boolean);
      if (vertices.length !== 3 || new Set(vertices).size !== 3) continue;
      const first = new THREE.Vector3().fromArray(mesh.positions, vertexIndices[0] * 3);
      const second = new THREE.Vector3().fromArray(mesh.positions, vertexIndices[1] * 3);
      const third = new THREE.Vector3().fromArray(mesh.positions, vertexIndices[2] * 3);
      const reference = second.clone().sub(first);
      const normal = new THREE.Vector3().crossVectors(reference, third.clone().sub(first));
      if (reference.lengthSq() < 1e-12 || normal.lengthSq() < 1e-12) continue;
      reference.normalize();
      normal.normalize();
      const loop = add(`POLY_LOOP('',(${vertices.map((id) => `#${id}`).join(",")}))`);
      const bound = add(`FACE_OUTER_BOUND('',#${loop},.T.)`);
      const normalDirection = add(`DIRECTION('',(${normal.toArray().map((value) => value.toFixed(9)).join(",")}))`);
      const referenceDirection = add(`DIRECTION('',(${reference.toArray().map((value) => value.toFixed(9)).join(",")}))`);
      const placement = add(`AXIS2_PLACEMENT_3D('',#${vertices[0]},#${normalDirection},#${referenceDirection})`);
      const plane = add(`PLANE('',#${placement})`);
      faceIds.push(add(`FACE_SURFACE('',(#${bound}),#${plane},.T.)`));
    }
    if (!faceIds.length) continue;
    if (meshIsClosed(mesh)) {
      const shell = add(`CLOSED_SHELL('${stepText(mesh.name)}',(${faceIds.map((id) => `#${id}`).join(",")}))`);
      closedItems.push(add(`FACETED_BREP('${stepText(mesh.name)}',#${shell})`));
    } else {
      const shell = add(`OPEN_SHELL('${stepText(mesh.name)}',(${faceIds.map((id) => `#${id}`).join(",")}))`);
      openItems.push(add(`SHELL_BASED_SURFACE_MODEL('${stepText(mesh.name)}',(#${shell}))`));
    }
  }
  const representation = add(`SHAPE_REPRESENTATION('${stepText(harness.number)}',(#${axis}),#${context})`);
  if (closedItems.length) {
    const solids = add(`FACETED_BREP_SHAPE_REPRESENTATION('${stepText(harness.number)}_SOLIDS',(${closedItems.map((id) => `#${id}`).join(",")}),#${context})`);
    add(`SHAPE_REPRESENTATION_RELATIONSHIP('SRR','faceted solids',#${representation},#${solids})`);
  }
  if (openItems.length) {
    const surfaces = add(`MANIFOLD_SURFACE_SHAPE_REPRESENTATION('${stepText(harness.number)}_SURFACES',(${openItems.map((id) => `#${id}`).join(",")}),#${context})`);
    add(`SHAPE_REPRESENTATION_RELATIONSHIP('SRR','surface models',#${representation},#${surfaces})`);
  }
  add(`SHAPE_DEFINITION_REPRESENTATION(#${productShape},#${representation})`);
  const body = entities.map((entity, index) => `#${index + 1}=${entity};`).join("\n");
  return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Harness Designer 3D static export'),'2;1');\nFILE_NAME('${safeName(project.projectNumber)}_${safeName(harness.number)}.step','${new Date().toISOString()}',('Harness Designer'),('Harness Designer'),'Harness Designer','Harness Designer','');\nFILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 1 1 4 }'));\nENDSEC;\nDATA;\n${body}\nENDSEC;\nEND-ISO-10303-21;\n`;
}
