export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-[var(--pb-text)]">{title}</h2>
        {subtitle && (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--pb-text-muted)]">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}
