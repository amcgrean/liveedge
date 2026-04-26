'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  BookOpen, Search, ChevronRight, ChevronDown, ExternalLink,
  Wrench, X, Menu,
} from 'lucide-react';
import { GROUPS, TOPICS, type Topic, type Group } from './help-data';

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const needle = q.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  const lower = text.toLowerCase();
  while (i < text.length) {
    const at = lower.indexOf(needle, i);
    if (at === -1) {
      out.push(text.slice(i));
      break;
    }
    if (at > i) out.push(text.slice(i, at));
    out.push(
      <mark key={at} className="bg-cyan-500/30 text-white rounded px-0.5">
        {text.slice(at, at + q.length)}
      </mark>
    );
    i = at + q.length;
  }
  return <>{out}</>;
}

function topicMatches(t: Topic, q: string): boolean {
  if (!q) return true;
  const hay = (
    t.title + ' ' + t.body + ' ' + (t.keywords || []).join(' ') + ' ' + (t.path || '')
  ).toLowerCase();
  return hay.includes(q.toLowerCase());
}

function ArticleBody({ topic, q }: { topic: Topic; q: string }) {
  const paragraphs: string[] = topic.body.split(/\n\n+/);
  return (
    <article className="prose prose-invert max-w-none">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-xs text-slate-500 uppercase tracking-widest">
          {GROUPS.find((g) => g.id === topic.group)?.title}
        </span>
        {topic.path && (
          <Link
            href={topic.path}
            className="text-xs text-cyan-400 hover:underline inline-flex items-center gap-1 font-mono"
          >
            {topic.path} <ExternalLink className="w-3 h-3" />
          </Link>
        )}
        {topic.roles && topic.roles.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/10">
            Roles: {topic.roles.join(', ')}
          </span>
        )}
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1 mb-4">
        {highlight(topic.title, q)}
      </h1>
      <div className="space-y-4 text-slate-300 leading-relaxed">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-sm sm:text-[15px]">
            {highlight(p, q)}
          </p>
        ))}
      </div>
      {topic.steps && topic.steps.length > 0 && (
        <div className="mt-6 rounded-xl border border-white/10 bg-slate-900/60 p-5">
          <div className="text-xs text-slate-500 uppercase tracking-widest mb-3">Steps</div>
          <ol className="space-y-2.5">
            {topic.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>{highlight(s, q)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </article>
  );
}

type Props = { initialTopicId?: string };

export default function HelpClient({ initialTopicId }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlTopic = searchParams.get('topic') || initialTopicId || TOPICS[0].id;

  const [q, setQ] = React.useState('');
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(GROUPS.map((g) => [g.id, true]))
  );
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setQ('');
        searchRef.current?.blur();
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const filteredByGroup = React.useMemo(() => {
    const out: Record<string, Topic[]> = {};
    for (const g of GROUPS) {
      out[g.id] = TOPICS.filter((t) => t.group === g.id && topicMatches(t, q));
    }
    return out;
  }, [q]);

  const allMatches = React.useMemo(
    () => TOPICS.filter((t) => topicMatches(t, q)),
    [q]
  );

  const activeTopic =
    TOPICS.find((t) => t.id === urlTopic) ??
    allMatches[0] ??
    TOPICS[0];

  function selectTopic(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('topic', id);
    router.replace(`/help?${params.toString()}`, { scroll: false });
    setSidebarOpen(false);
  }

  function toggleGroup(id: string) {
    setOpenGroups((p) => ({ ...p, [id]: !p[id] }));
  }

  // When searching, auto-expand groups that have matches and collapse those that don't
  React.useEffect(() => {
    if (!q) return;
    setOpenGroups(
      Object.fromEntries(
        GROUPS.map((g) => [g.id, (filteredByGroup[g.id]?.length ?? 0) > 0])
      )
    );
  }, [q, filteredByGroup]);

  const Sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search docs… (press /)"
            className="w-full pl-9 pr-8 py-2 bg-slate-900 border border-white/10 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {q && (
          <div className="mt-2 text-xs text-slate-500">
            {allMatches.length} {allMatches.length === 1 ? 'result' : 'results'}
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {GROUPS.map((g: Group) => {
          const list = filteredByGroup[g.id] || [];
          if (q && list.length === 0) return null;
          const expanded = openGroups[g.id] ?? true;
          return (
            <div key={g.id} className="mb-1">
              <button
                onClick={() => toggleGroup(g.id)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-200"
              >
                {expanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                {g.title}
                <span className="ml-auto text-[10px] text-slate-600 font-normal normal-case">
                  {list.length}
                </span>
              </button>
              {expanded && (
                <div className="ml-3 border-l border-white/5 pl-2 space-y-0.5">
                  {list.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => selectTopic(t.id)}
                      className={`w-full text-left px-2 py-1.5 text-sm rounded transition ${
                        t.id === activeTopic.id
                          ? 'bg-cyan-500/10 text-cyan-300 font-medium'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                    >
                      {highlight(t.title, q)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {q && allMatches.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-slate-500">
            No results for "<span className="text-slate-300">{q}</span>"
          </div>
        )}
      </nav>
      <div className="p-3 border-t border-white/10 text-[11px] text-slate-500 leading-relaxed">
        Press <kbd className="px-1 py-0.5 bg-slate-800 rounded border border-white/10 text-slate-400">/</kbd> to search.{' '}
        Can&apos;t find it?{' '}
        <Link href="/it-issues" className="text-cyan-400 hover:underline">
          Report an issue
        </Link>
        .
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex">
      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen lg:h-[calc(100vh-3.5rem)] lg:top-14 w-72 bg-slate-950 border-r border-white/10 z-50 transform transition-transform lg:transform-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {Sidebar}
      </aside>

      <main className="flex-1 min-w-0">
        {/* Mobile top bar (with hamburger) */}
        <div className="lg:hidden sticky top-14 z-30 bg-slate-950/95 backdrop-blur border-b border-white/10 px-4 py-2 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="text-sm text-slate-300 font-medium truncate">{activeTopic.title}</div>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 sm:py-10">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-white/10">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-widest">
                Beisser LiveEdge
              </div>
              <h2 className="text-lg font-bold text-white">Help &amp; Documentation</h2>
            </div>
          </div>

          <ArticleBody topic={activeTopic} q={q} />

          {/* Footer CTA */}
          <div className="mt-12 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
              <Wrench className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold mb-0.5">Still need help?</h3>
              <p className="text-sm text-slate-400">
                Submit an IT issue and the team will get back to you. Include the page you were on,
                what you were trying to do, and any error messages.
              </p>
            </div>
            <Link
              href="/it-issues"
              className="flex-shrink-0 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-sm font-semibold hover:bg-cyan-400 transition"
            >
              Report an Issue
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
