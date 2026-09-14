/**
 * Screen state for the Lernumi build.
 *
 * Lernumi serves each tool version from a versioned sub-path on an isolated
 * origin (`/tools/easydraw/<versionId>/…`), so there is no stable URL space to
 * route on. The whole app is one `index.html`, and "navigation" is a state
 * change here. `next/link` and `next/navigation` are aliased to shims that call
 * `navigate()`, which lets the shared editor chrome (MenuBar etc.) stay untouched.
 */
import { create } from 'zustand';
import type { ToolApiClient } from './platform/client';
import type { RuntimeContext } from './platform/types';

export type Screen =
  | { kind: 'booting' }
  | { kind: 'dashboard' }
  | { kind: 'editor'; diagramId: string }
  /** Token gone, launch link incomplete, or the session was ended on purpose. */
  | { kind: 'blocked'; title: string; detail: string };

type LernumiAppState = {
  screen: Screen;
  client: ToolApiClient | null;
  context: RuntimeContext | null;
  /** True after submission: the workspace can be viewed but not changed. */
  readOnly: boolean;
  setSession: (client: ToolApiClient, context: RuntimeContext) => void;
  setScreen: (screen: Screen) => void;
  /** Path-shaped navigation so the Next.js router shims have something to call. */
  navigate: (path: string) => void;
};

export const useLernumiApp = create<LernumiAppState>((set, get) => ({
  screen: { kind: 'booting' },
  client: null,
  context: null,
  readOnly: false,
  setSession: (client, context) =>
    set({ client, context, readOnly: context.session.readOnly }),
  setScreen: (screen) => set({ screen }),
  navigate: (path) => {
    const clean = path.split(/[?#]/, 1)[0];
    const editor = clean.match(/^\/editor\/([^/]+)\/?$/);
    if (editor) {
      set({ screen: { kind: 'editor', diagramId: decodeURIComponent(editor[1]) } });
      return;
    }
    if (clean === '/dashboard' || clean === '/') {
      set({ screen: { kind: 'dashboard' } });
      return;
    }
    if (clean === '/login') {
      // MenuBar's "Log out" lands here. There is no easydraw account to leave;
      // the session simply ends and the student returns to the Lernumi tab.
      get().client?.closeSession();
      set({
        screen: {
          kind: 'blocked',
          title: 'Session ended',
          detail: 'You can close this tab and return to Lernumi. Reopen the tool from the assessment page to continue.',
        },
      });
      return;
    }
    // `/settings`, legal pages and the landing page do not exist inside Lernumi.
  },
}));

/** Pathname as the shared editor expects it (`useDiagramId()` reads `/editor/<id>`). */
export function pathnameFor(screen: Screen): string {
  return screen.kind === 'editor' ? `/editor/${encodeURIComponent(screen.diagramId)}` : '/dashboard';
}
