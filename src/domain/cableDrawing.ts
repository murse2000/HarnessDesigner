export interface CableBreakoutGeometry {
  sourceX: number;
  targetX: number;
}

export interface CableJacketGeometry {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

export function cableBreakoutGeometry(sourceX: number, targetX: number, preferredLength = 110, sourceLength?: number, targetLength?: number): CableBreakoutGeometry {
  const direction = targetX >= sourceX ? 1 : -1;
  const availableLength = Math.max(0, Math.abs(targetX - sourceX) - 40);
  const automaticLength = Math.min(preferredLength, availableLength / 2);
  const resolvedSourceLength = Math.min(Math.max(0, sourceLength ?? automaticLength), availableLength);
  const resolvedTargetLength = Math.min(Math.max(0, targetLength ?? automaticLength), availableLength - resolvedSourceLength);
  return {
    sourceX: sourceX + direction * resolvedSourceLength,
    targetX: targetX - direction * resolvedTargetLength,
  };
}

export function cableJacketGeometry(sourceX: number, sourceY: number, targetX: number, targetY: number, preferredLength: number, offsetX = 0, offsetY = 0, sourceLength?: number, targetLength?: number): CableJacketGeometry {
  const breakout = cableBreakoutGeometry(sourceX, targetX, preferredLength, sourceLength, targetLength);
  return {
    sourceX: breakout.sourceX + offsetX,
    sourceY: sourceY + offsetY,
    targetX: breakout.targetX + offsetX,
    targetY: targetY + offsetY,
  };
}

export function cableFanoutPath(pinX: number, pinY: number, breakoutX: number, breakoutY: number): string {
  const direction = Math.sign(breakoutX - pinX) || 1;
  const controlLength = Math.min(48, Math.abs(breakoutX - pinX) * 0.45);
  return `M ${pinX} ${pinY} C ${pinX + direction * controlLength} ${pinY}, ${breakoutX - direction * controlLength} ${breakoutY}, ${breakoutX} ${breakoutY}`;
}
