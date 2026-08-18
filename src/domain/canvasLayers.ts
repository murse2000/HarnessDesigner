export const canvasLayerIds = ["sheet", "nodes", "cables", "conductors", "accessories", "annotations"] as const;

export const canvasLayerZIndex = { sheet: 0, cables: 1, conductors: 2, accessories: 3, labels: 5 } as const;

export type CanvasLayerId = (typeof canvasLayerIds)[number];

export interface CanvasLayerState {
  visible: boolean;
  locked: boolean;
}

export type CanvasLayers = Record<CanvasLayerId, CanvasLayerState>;

export function createCanvasLayers(): CanvasLayers {
  return Object.fromEntries(canvasLayerIds.map((id) => [id, { visible: true, locked: false }])) as CanvasLayers;
}

export function updateCanvasLayer(layers: CanvasLayers, id: CanvasLayerId, field: keyof CanvasLayerState): CanvasLayers {
  return { ...layers, [id]: { ...layers[id], [field]: !layers[id][field] } };
}
