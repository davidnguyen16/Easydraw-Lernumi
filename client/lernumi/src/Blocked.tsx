import Logo from '@/lib/components/Logo';

/** Full-page notice for states the student cannot act on inside the tool. */
export default function Blocked({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-panel px-6 text-center">
      <Logo size="md" />
      <div className="max-w-md rounded-2xl border border-line-soft bg-white px-8 py-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p>
      </div>
    </div>
  );
}
