import { MapSceneGraphState } from './map-scene-contract';

export function createBlankSceneGraph(name: string, sceneKey?: string): MapSceneGraphState {
  return {
    sceneKey: sceneKey || `scene-${Date.now()}`,
    name,
    biome: 'Abandoned Crypt',
    revision: 1,
    scatterSeed: 1001,
    scatterDensity: 0,
    terrainRelief: 0,
    stamps: [],
    waterSplines: [],
    lights: [],
    walls: [],
    pathRibbons: [],
  };
}
