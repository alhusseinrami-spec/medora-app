export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="min-h-dvh grid place-items-center px-4 py-10 bg-[radial-gradient(ellipse_at_top,var(--teal-soft),transparent_60%)]">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-3 mb-6 justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={40} height={40} />
          <div>
            <div className="font-bold text-lg leading-tight">Medora Care</div>
            <div className="text-sm text-muted">Executive Command Center</div>
          </div>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </main>
  );
}
