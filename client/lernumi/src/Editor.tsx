import { useEffect, useState } from 'react';
import Flow from '@/lib/flow/Flow';
import { useEditorDoc } from '@/lib/stores/editor-doc.store';
import { useEditorMeta } from '@/lib/stores/editor-meta.store';
import { useEditorStore } from '@/lib/stores/editor.store';
import { useLernumiApp } from './app-store';
import type { LernumiDiagrams } from './diagrams';

/**
 * Loads one diagram from the Lernumi workspace and hands it to the shared
 * editor. Mirrors `src/app/(app)/editor/[id]/EditorClient.tsx`; the diagram id
 * reaches `Flow` through the `next/navigation` shim (`usePathname()`). App keys this
 * component by diagram id, so switching diagrams remounts it with fresh state.
 */
export default function Editor({
  diagramId,
  diagrams,
}: {
  diagramId: string;
  diagrams: LernumiDiagrams;
}) {
  const readOnly = useLernumiApp((s) => s.readOnly);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  // The editor is full-screen and must NOT scroll (unlike the dashboard).
  useEffect(() => {
    document.body.classList.add('editor-mode');
    return () => document.body.classList.remove('editor-mode');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let opened: Awaited<ReturnType<LernumiDiagrams['open']>>;
      try {
        opened = await diagrams.open(diagramId);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this diagram.');
        return;
      }
      if (cancelled) return;
      if (!opened) {
        setError('This diagram no longer exists in the workspace.');
        return;
      }
      // A freshly created file has no pages yet → not a valid state → start fresh.
      const doc = useEditorDoc.getState();
      const ok = doc.loadEditorStateFromJSON(JSON.stringify(opened.file));
      if (!ok) doc.resetEditorState();
      useEditorMeta.getState().setFileName(opened.summary.title);
      // A submitted attempt can be viewed but not edited: lock the canvas.
      const editor = useEditorStore.getState();
      if (readOnly !== editor.locked) editor.toggleLock();
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [diagramId, diagrams, readOnly]);

  if (loaded) {
    return (
      <main className="h-screen w-full overflow-hidden">
        <Flow />
      </main>
    );
  }
  if (error) {
    return <div className="flex h-screen items-center justify-center text-ink-muted">{error}</div>;
  }
  return <div className="flex h-screen items-center justify-center text-ink-muted">Loading...</div>;
}
