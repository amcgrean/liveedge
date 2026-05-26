import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

export type BreadcrumbItem = {
  href?: string;
  label: string;
};

export default function Breadcrumb({
  items,
  showHome = true,
}: {
  items: BreadcrumbItem[];
  showHome?: boolean;
}) {
  const trail: BreadcrumbItem[] = showHome
    ? [{ href: '/', label: 'Home' }, ...items]
    : items;

  return (
    <nav
      aria-label="Breadcrumb"
      className="max-w-screen-2xl mx-auto px-6 pt-4 pb-2 print:hidden"
    >
      <ol className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
        {trail.map((item, idx) => {
          const isLast = idx === trail.length - 1;
          const content =
            idx === 0 && showHome ? (
              <span className="inline-flex items-center gap-1">
                <Home className="w-3 h-3" />
                {item.label}
              </span>
            ) : (
              item.label
            );
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-600" />}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="hover:text-cyan-300 transition"
                >
                  {content}
                </Link>
              ) : (
                <span className={isLast ? 'text-slate-200 font-medium' : ''}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
