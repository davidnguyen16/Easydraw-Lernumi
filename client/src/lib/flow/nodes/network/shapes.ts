import type { NodeShape } from '../types';
import { NETWORK_DEFINITIONS } from './definitions';
import NetworkNode from './NetworkNode';
import NetworkPaletteIcon from './NetworkPaletteIcon';

/** Code-native network containers. Device artwork comes from LibraryAsset/S3. */
export const networkShapes: readonly NodeShape[] = NETWORK_DEFINITIONS.map((definition) => ({
	id: definition.id,
	label: definition.label,
	category: 'network',
	paletteGroup: definition.paletteGroup,
	searchAliases: definition.searchAliases,
	component: NetworkNode,
	icon: NetworkPaletteIcon,
	paletteIconProps: { id: definition.id },
	defaultWidth: definition.defaultWidth,
	defaultHeight: definition.defaultHeight,
	// Svelte Flow elevates a selected node by 1000. A deeper base layer keeps
	// visual zones behind real devices even while their resize frame is active.
	defaultZIndex: -2000,
	defaultData: () => ({
		label: definition.label,
		accentColor: '#189589',
		textAlign: 'left'
	})
}));
