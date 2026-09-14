// Vite alias target for `next/navigation` in the Lernumi build. The shared editor
// only uses `useRouter().push()` and `usePathname()`; both map onto the app store.
import { pathnameFor, useLernumiApp } from '../app-store';

export function useRouter() {
  const navigate = useLernumiApp((s) => s.navigate);
  return {
    push: navigate,
    replace: navigate,
    back: () => navigate('/dashboard'),
    prefetch: () => undefined,
    refresh: () => undefined,
  };
}

export function usePathname(): string {
  return useLernumiApp((s) => pathnameFor(s.screen));
}
