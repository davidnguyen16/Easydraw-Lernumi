import type { PaletteGroupId } from '../types';

export interface NetworkDefinition {
  id: string;
  label: string;
  paletteGroup: PaletteGroupId;
  searchAliases: readonly string[];
  kind: 'container';
  defaultWidth: number;
  defaultHeight: number;
  minWidth: number;
  minHeight: number;
  keepAspectRatio: boolean;
}

function container(
  id: string,
  label: string,
  searchAliases: readonly string[],
): NetworkDefinition {
  return {
    id,
    label,
    paletteGroup: 'zones-containers',
    searchAliases,
    kind: 'container',
    defaultWidth: 320,
    defaultHeight: 210,
    minWidth: 160,
    minHeight: 100,
    keepAspectRatio: false,
  };
}

// Only network shapes with editor behaviour remain code-native. Device artwork
// and all of its catalog metadata live in LibraryAsset/S3.
export const NETWORK_DEFINITIONS = [
  container('NetworkSubnetNode', 'Subnet', ['ip subnet', 'network segment']),
  container('NetworkVlanNode', 'VLAN', [
    'virtual lan',
    'virtual local area network',
  ]),
  container('NetworkDmzNode', 'DMZ', [
    'demilitarized zone',
    'perimeter network',
  ]),
  container('NetworkZoneNode', 'Network Zone', [
    'security zone',
    'network boundary',
  ]),
  container('NetworkRackClusterNode', 'Rack / Cluster', [
    'server rack',
    'compute cluster',
    'node group',
  ]),
] as const satisfies readonly NetworkDefinition[];

export type NetworkNodeId = (typeof NETWORK_DEFINITIONS)[number]['id'];

const DEFINITION_BY_ID = new Map<string, NetworkDefinition>(
  NETWORK_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function getNetworkDefinition(
  id: string | null | undefined,
): NetworkDefinition | undefined {
  return id ? DEFINITION_BY_ID.get(id) : undefined;
}
