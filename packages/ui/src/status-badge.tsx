export type StatusBadgeProps = {
  status: 'online' | 'offline' | 'checking';
  children: string;
};

export function StatusBadge({ status, children }: StatusBadgeProps) {
  const classes = {
    online: 'bg-emerald-100 text-emerald-800',
    offline: 'bg-rose-100 text-rose-800',
    checking: 'bg-amber-100 text-amber-800',
  }[status];

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classes}`}>
      {children}
    </span>
  );
}
