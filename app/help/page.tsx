import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen, Boxes, Truck, ShoppingCart, FileText, PackageCheck,
  Wrench, Settings, Search, User, ChevronRight, Home, Layers,
  ClipboardList, BarChart2, MapPin, Camera, Calculator, FolderOpen,
} from 'lucide-react';

export const metadata = { title: 'Help & Documentation | LiveEdge' };

const sections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: <Home className="w-5 h-5" />,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    items: [
      {
        q: 'What is LiveEdge?',
        a: 'LiveEdge is Beisser Lumber\'s internal operations platform — a single app that brings together estimating, yard operations, dispatch, purchasing, sales tools, and more across all four Iowa locations (Fort Dodge, Grimes, Birchwood, Coralville).',
      },
      {
        q: 'How do I switch locations?',
        a: 'Use the branch switcher in the top-right navigation bar (shows a pin icon and your current location code). Click it to pick a different branch. Your selection is saved and filters data throughout the app.',
      },
      {
        q: 'How do I search across the app?',
        a: 'Click the search icon in the top nav or press Ctrl+K (Cmd+K on Mac) from anywhere in the app to open the global search bar.',
      },
      {
        q: 'How do I report a problem or request a feature?',
        a: 'Click your name in the top-right corner, then choose "Report an Issue." Fill in the form to submit an IT issue — the team will be notified.',
      },
      {
        q: 'How do I sign out?',
        a: 'Click your name in the top-right corner to open the account menu, then click "Sign Out."',
      },
    ],
  },
  {
    id: 'yard',
    title: 'Yard',
    icon: <Boxes className="w-5 h-5" />,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    items: [
      {
        q: 'What is the Picks Board?',
        a: 'The Picks Board (/warehouse) shows all active pick jobs for your branch, grouped by status. It refreshes every 60 seconds. Use it to monitor what\'s being pulled in the yard.',
      },
      {
        q: 'What is Open Picks?',
        a: 'Open Picks (/warehouse/open-picks) shows which pickers are currently active and how many lines they\'ve processed today and over the past 5 days.',
      },
      {
        q: 'What does Picker Stats show?',
        a: 'Picker Stats (/warehouse/picker-stats) shows aggregate performance per picker — total lines, average per day — for a configurable time period. Great for weekly reviews.',
      },
      {
        q: 'What are Work Orders?',
        a: 'Work Orders (/work-orders) shows open WOs from the ERP. You can search by SO number using the barcode scanner, assign pickers, and mark orders complete.',
      },
      {
        q: 'Who can see the Supervisor view?',
        a: 'The Supervisor page (/supervisor) is visible to users with the supervisor, ops, or warehouse role. It shows a real-time picker status board (active/assigned/idle) that refreshes every 30 seconds.',
      },
    ],
  },
  {
    id: 'dispatch',
    title: 'Dispatch & Delivery',
    icon: <Truck className="w-5 h-5" />,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    items: [
      {
        q: 'What is the Dispatch Board?',
        a: 'The Dispatch Board (/dispatch) shows today\'s delivery stops pulled from the ERP. Dispatchers can build and manage routes, assign stops, and track progress.',
      },
      {
        q: 'What is the Delivery Tracker?',
        a: 'The Delivery Tracker (/delivery) shows today\'s and overdue deliveries with K/P/S statuses (Keyed, Picked, Shipped). It also includes a fleet GPS panel.',
      },
      {
        q: 'What is the Fleet Map?',
        a: 'The Fleet Map (/delivery/map) shows live Samsara GPS data for all vehicles — card view with speed, address, and last update time. Data refreshes approximately every 15 seconds.',
      },
      {
        q: 'What is the Delivery Report?',
        a: 'The Ops Delivery Report (/ops/delivery-reporting) provides ERP analytics for deliveries — bar chart by date, filterable by branch and date range, with CSV export. Visible to supervisors and ops users.',
      },
    ],
  },
  {
    id: 'sales',
    title: 'Sales',
    icon: <ShoppingCart className="w-5 h-5" />,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    items: [
      {
        q: 'What is the Sales Hub?',
        a: 'The Sales Hub (/sales) is a KPI dashboard showing open orders, recent activity, and quick metrics for your branch. A good daily starting point for sales staff.',
      },
      {
        q: 'How do I look up a customer?',
        a: 'Go to Sales → Customers (/sales/customers) and search by name or customer code. Click a customer to view their profile, open orders, 90-day history, and ship-to addresses.',
      },
      {
        q: 'How do I search for a specific order?',
        a: 'Go to Sales → Transactions (/sales/transactions) for the full-screen order search workspace. Filter by status, date range, sale type, or customer. Click any SO number to see the full order detail.',
      },
      {
        q: 'What is Purchase History?',
        a: 'Purchase History (/sales/history) shows invoiced and closed orders. Use it to look up what was previously ordered, with filters for customer, date range, and branch.',
      },
      {
        q: 'How do I search the item catalog?',
        a: 'Go to Sales → Products & Stock (/sales/products). Search by item code or description. Results show on-hand quantities per branch and handling codes.',
      },
      {
        q: 'What are RMA Credits?',
        a: 'RMA Credits (/credits) lets you search for credit images by RMA number or email address. This is metadata from the warehouse credit imaging system.',
      },
    ],
  },
  {
    id: 'services',
    title: 'Services (Estimating & Design)',
    icon: <FileText className="w-5 h-5" />,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    items: [
      {
        q: 'What is the Estimating App?',
        a: 'The Estimating App (/estimating) is the main interface for creating and managing bids. It provides takeoff input forms, formula-driven calculations, and links to PDF takeoff sessions.',
      },
      {
        q: 'What is PDF Takeoff?',
        a: 'PDF Takeoff (/takeoff) lets you upload a construction PDF and measure directly on it — linear footage, areas, and counts. Measurements sync to the linked bid\'s inputs automatically. It replaces Bluebeam Revu.',
      },
      {
        q: 'How do I start a takeoff from an existing bid?',
        a: 'Open the bid in Bids (/legacy-bids/[id]), scroll to the bottom, and click "Start Takeoff." This creates a linked takeoff session with the appropriate measurement presets pre-loaded based on the bid\'s spec flags.',
      },
      {
        q: 'How do I use PDF Takeoff measurement tools?',
        a: 'In a takeoff session, click a preset button in the sidebar (e.g., "1st Floor Ext 2x6 9\'") to activate that tool. Draw on the PDF — polyline tools measure linear footage, polygon tools measure area, and point tools count items. Zoom with scroll wheel, pan by holding middle-mouse or space+drag.',
      },
      {
        q: 'What is EWP?',
        a: 'EWP (Engineered Wood Products) (/ewp) is a module for tracking EWP jobs — beam/truss orders. You can add, edit, and import EWP records via CSV.',
      },
      {
        q: 'What is Design?',
        a: 'The Design module (/designs) tracks design projects with auto-generated plan numbers (D-YYMM-NNN). Each design has an activity log and links to the customer record.',
      },
      {
        q: 'What are Bid Projects?',
        a: 'Bid Projects (/bids) are the newer UUID-based estimating projects. These are takeoff sessions that can exist independently or be linked to a legacy bid record.',
      },
    ],
  },
  {
    id: 'purchasing',
    title: 'Purchasing & Receiving',
    icon: <PackageCheck className="w-5 h-5" />,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    items: [
      {
        q: 'What is the Buyer Workspace?',
        a: 'The Buyer Workspace (/purchasing/workspace) is the purchasing team\'s daily starting page — quick-action cards, upcoming POs, and recent check-ins at a glance.',
      },
      {
        q: 'How do I see open purchase orders?',
        a: 'Go to Purchasing → Open POs (/purchasing/open-pos). This shows all open POs with overdue highlighting. Click a PO to see full line-item detail with received quantities.',
      },
      {
        q: 'What is the Command Center?',
        a: 'The Purchasing Command Center (/purchasing/manage) shows KPI cards, POs by branch, overdue lists, and recent submissions — an ops-level overview for purchasing managers.',
      },
      {
        q: 'How does PO Check-In (Receiving) work?',
        a: 'Go to Purchasing → PO Check-In (/purchasing). This is a multi-step receiving workflow: scan or enter a PO number, verify line items, and submit with optional photos. Photos are stored in Cloudflare R2.',
      },
      {
        q: 'What is the Review Queue?',
        a: 'The Review Queue (/purchasing/review) shows submitted receiving records waiting for review. Reviewers can view photos, add notes, and mark submissions as reviewed or flagged.',
      },
    ],
  },
  {
    id: 'admin',
    title: 'Admin',
    icon: <Settings className="w-5 h-5" />,
    color: 'text-slate-400',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20',
    items: [
      {
        q: 'Who has access to the Admin panel?',
        a: 'Only users with the "admin" role see the Admin menu in the nav. It contains user management, bid field configuration, notifications, audit logs, ERP sync status, and page analytics.',
      },
      {
        q: 'How do I manage user permissions?',
        a: 'Go to Admin → Users (/admin/users), click a user, then go to Permissions. You can grant/revoke access to specific modules and set the user\'s role.',
      },
      {
        q: 'What is ERP Sync?',
        a: 'ERP Sync (/admin/erp) shows the connection status to the Supabase ERP database, lets you browse tables, preview data, and trigger a manual customer sync. Auto-sync runs daily at 6 AM UTC.',
      },
      {
        q: 'What is the Audit Log?',
        a: 'The Audit Log (/admin/audit) records key actions across the system — bid edits, user changes, etc. — with timestamps and user attribution.',
      },
      {
        q: 'What are Bid Fields?',
        a: 'Bid Fields (/admin/bid-fields) lets admins configure the input fields shown in the Estimating App — which fields are visible, required, or grouped.',
      },
    ],
  },
];

const workflows = [
  {
    title: 'Create a bid and start a takeoff',
    steps: [
      'Go to Services → Bids (/legacy-bids) and click "Add Bid."',
      'Fill in customer, job name, address, and spec flags (framing, siding, shingles, etc.).',
      'Save the bid, then open it and click "Start Takeoff."',
      'Upload the construction PDF in the takeoff workspace.',
      'Use the measurement presets in the sidebar to measure the drawing.',
      'Click "Send to Estimate" when done — measurements write back to the bid inputs.',
    ],
  },
  {
    title: 'Receive a PO shipment',
    steps: [
      'Go to Purchasing → PO Check-In (/purchasing).',
      'Enter or scan the PO number.',
      'Verify line items against what was received — adjust quantities as needed.',
      'Optionally attach photos of the shipment.',
      'Submit the check-in. It will appear in the Review Queue for confirmation.',
    ],
  },
  {
    title: 'Look up a customer\'s order history',
    steps: [
      'Go to Sales → Customers (/sales/customers).',
      'Search by customer name or code.',
      'Click the customer to open their profile.',
      'Use the "History" tab to see invoiced/closed orders.',
      'Click any SO number to open the full order detail.',
    ],
  },
  {
    title: 'Monitor the yard during a shift',
    steps: [
      'Start at the Picks Board (/warehouse) to see all active picks.',
      'Check Open Picks to see which pickers are active and their progress.',
      'Use the Supervisor view (/supervisor) for a real-time status board (refreshes every 30s).',
      'Check Work Orders for any WOs that need picker assignment.',
    ],
  },
];

export default async function HelpPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-widest">Beisser LiveEdge</div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Help &amp; Documentation</h1>
            </div>
          </div>
          <p className="text-slate-400 text-sm sm:text-base max-w-2xl">
            Everything you need to use LiveEdge — module guides, common workflows, and troubleshooting tips.
          </p>

          {/* Quick-jump nav */}
          <div className="mt-6 flex flex-wrap gap-2">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
              >
                {s.title}
              </a>
            ))}
            <a
              href="#workflows"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
            >
              Common Workflows
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12">

        {/* Module sections */}
        {sections.map((section) => (
          <section key={section.id} id={section.id}>
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-9 h-9 rounded-xl ${section.bg} flex items-center justify-center border ${section.border}`}>
                <span className={section.color}>{section.icon}</span>
              </div>
              <h2 className="text-xl font-bold text-white">{section.title}</h2>
            </div>
            <div className="space-y-3">
              {section.items.map((item, i) => (
                <details
                  key={i}
                  className="group rounded-xl border border-white/10 bg-slate-900/60 overflow-hidden"
                >
                  <summary className="flex items-center justify-between px-4 py-3.5 cursor-pointer list-none hover:bg-slate-800/40 transition">
                    <span className="text-sm font-medium text-slate-200 pr-4">{item.q}</span>
                    <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0 transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="px-4 pb-4 pt-1 text-sm text-slate-400 leading-relaxed border-t border-white/5">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}

        {/* Common Workflows */}
        <section id="workflows">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-gold-500/10 flex items-center justify-center border border-gold-500/20">
              <ClipboardList className="w-5 h-5 text-gold-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Common Workflows</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {workflows.map((wf, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
                <h3 className="text-sm font-semibold text-white mb-3">{wf.title}</h3>
                <ol className="space-y-2">
                  {wf.steps.map((step, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm text-slate-400">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center mt-0.5">
                        {j + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        {/* Navigation guide */}
        <section id="navigation">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-slate-700/50 flex items-center justify-center border border-slate-600/30">
              <Layers className="w-5 h-5 text-slate-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Navigation Guide</h2>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-slate-950/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Menu</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Who sees it</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 hidden sm:table-cell">Key pages</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[
                  { menu: 'Yard', who: 'Warehouse / Ops / Supervisor / Dispatch roles', pages: 'Picks Board, Work Orders, Supervisor' },
                  { menu: 'Dispatch', who: 'Warehouse / Ops / Supervisor / Dispatch roles', pages: 'Dispatch Board, Delivery Tracker, Fleet Map' },
                  { menu: 'Sales', who: 'Sales / Ops / Supervisor roles', pages: 'Sales Hub, Customers, Transactions, Products' },
                  { menu: 'Services', who: 'Estimators / Admins', pages: 'Estimating App, PDF Takeoff, Bids, EWP, Designs' },
                  { menu: 'Purchasing', who: 'All authenticated users', pages: 'Open POs, Buyer Workspace, PO Check-In, Review Queue' },
                  { menu: 'Admin', who: 'Admin role only', pages: 'Users, Bid Fields, Audit Log, ERP Sync' },
                ].map((row) => (
                  <tr key={row.menu} className="hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3 font-medium text-white">{row.menu}</td>
                    <td className="px-4 py-3 text-slate-400">{row.who}</td>
                    <td className="px-4 py-3 text-slate-400 hidden sm:table-cell">{row.pages}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Your account menu (top-right, click your name) also has{' '}
            <Link href="/it-issues" className="text-cyan-400 hover:underline">Report an Issue</Link> and this Help page.
          </p>
        </section>

        {/* Still need help */}
        <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
            <Wrench className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold mb-1">Still need help?</h3>
            <p className="text-sm text-slate-400">
              Submit an IT issue and the team will get back to you. Include as much detail as possible — what page you were on, what you were trying to do, and any error messages you saw.
            </p>
          </div>
          <Link
            href="/it-issues"
            className="flex-shrink-0 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-sm font-semibold hover:bg-cyan-400 transition"
          >
            Report an Issue
          </Link>
        </section>

      </div>
    </div>
  );
}
