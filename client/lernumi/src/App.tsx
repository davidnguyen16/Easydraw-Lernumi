import { useEffect, useMemo } from 'react';
import { setDiagramBackend } from '@/lib/backend';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useLernumiApp } from './app-store';
import Blocked from './Blocked';
import Dashboard from './Dashboard';
import Editor from './Editor';
import { LernumiDiagrams } from './diagrams';
import { ToolApiClient } from './platform/client';

/**
 * Boot sequence, per the Lernumi tool contract:
 *   1. read + erase the launch fragment,
 *   2. `GET /context` to learn who is working on what and whether it is read-only,
 *   3. land on the dashboard straight away — there is no easydraw login here.
 */
export default function App() {
  const screen = useLernumiApp((s) => s.screen);
  const client = useLernumiApp((s) => s.client);
  const diagrams = useMemo(() => (client ? new LernumiDiagrams(client) : null), [client]);

  useEffect(() => {
    const app = useLernumiApp.getState();
    let api: ToolApiClient;
    try {
      api = ToolApiClient.fromLaunchLocation();
    } catch (error) {
      app.setScreen({
        kind: 'blocked',
        title: 'This launch link is incomplete',
        detail:
          error instanceof Error
            ? error.message
            : 'Open EasyDraw from the assessment page in Lernumi.',
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const context = await api.context();
        if (cancelled) return;
        app.setSession(api, context);
        // The shared editor chrome reads the signed-in user from the easydraw
        // auth store; there is no account here, so feed it the Lernumi person.
        useAuthStore.setState({
          user: { id: context.user.id, email: '', name: context.user.displayName },
          ready: true,
          logout: async () => undefined,
        });
        void api.startTokenRefresh();
        app.setScreen({ kind: 'dashboard' });
      } catch (error) {
        if (cancelled) return;
        app.setScreen({
          kind: 'blocked',
          title: 'EasyDraw could not start',
          detail:
            error instanceof Error ? error.message : 'Return to Lernumi and open the tool again.',
        });
      }
    })();

    const onExpired = () =>
      useLernumiApp.getState().setScreen({
        kind: 'blocked',
        title: 'Your session has expired',
        detail:
          'Reopen EasyDraw from the assessment page in Lernumi to continue. Saved diagrams are kept.',
      });
    const onPageHide = () => api.closeSession();
    window.addEventListener('lernumi:token-expired', onExpired);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      cancelled = true;
      api.stopTokenRefresh();
      window.removeEventListener('lernumi:token-expired', onExpired);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  // Route the editor autosave into the workspace. A read-only session never
  // writes: the canvas is locked, and anything that slips through is dropped.
  useEffect(() => {
    if (!diagrams) return;
    setDiagramBackend({
      saveDiagram: async (diagramId, payload) => {
        if (useLernumiApp.getState().readOnly) return;
        await diagrams.save(diagramId, payload);
      },
    });
  }, [diagrams]);

  switch (screen.kind) {
    case 'booting':
      return (
        <div className="flex min-h-screen items-center justify-center bg-panel text-ink-muted">
          Opening EasyDraw…
        </div>
      );
    case 'blocked':
      return <Blocked title={screen.title} detail={screen.detail} />;
    case 'dashboard':
      return diagrams ? <Dashboard diagrams={diagrams} /> : null;
    case 'editor':
      return diagrams ? <Editor key={screen.diagramId} diagramId={screen.diagramId} diagrams={diagrams} /> : null;
  }
}
