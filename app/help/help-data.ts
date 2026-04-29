// Help & Documentation content tree.
// Each Topic has: id (slug), title, group key, optional path/keywords, body.
// `body` is rendered as paragraphs (split on blank lines) plus optional steps.

export type Topic = {
  id: string;
  title: string;
  group: string;
  path?: string;
  roles?: string[];
  keywords?: string[];
  body: string;
  steps?: string[];
};

export type Group = {
  id: string;
  title: string;
  blurb?: string;
};

export const GROUPS: Group[] = [
  { id: 'getting-started', title: 'Getting Started', blurb: 'Sign in, navigation, branch context.' },
  { id: 'home', title: 'Home & Dashboard' },
  { id: 'yard', title: 'Yard' },
  { id: 'dispatch', title: 'Dispatch & Delivery' },
  { id: 'sales', title: 'Sales' },
  { id: 'management', title: 'Management & Scorecard' },
  { id: 'services', title: 'Services (Estimating & Design)' },
  { id: 'purchasing', title: 'Purchasing & Receiving' },
  { id: 'admin', title: 'Admin' },
  { id: 'workflows', title: 'Common Workflows' },
  { id: 'troubleshooting', title: 'Troubleshooting & FAQ' },
];

export const TOPICS: Topic[] = [
  // ─── Getting Started ─────────────────────────────────────────────
  {
    id: 'what-is-liveedge',
    title: 'What is LiveEdge?',
    group: 'getting-started',
    keywords: ['overview', 'about', 'beisser'],
    body:
      `LiveEdge is Beisser Lumber's internal operations platform. One app brings together estimating, yard operations, dispatch, sales tools, purchasing, management reporting, and admin across all four Iowa locations (Fort Dodge, Grimes, Birchwood, Coralville).\n\nIt replaces several legacy tools: WH-Tracker (yard / dispatch / sales), the Flask estimator (bids and designs), and Bluebeam Revu (PDF takeoff). Data is sourced live from the Agility ERP plus internal databases.`,
  },
  {
    id: 'signing-in',
    title: 'Signing in (passwordless OTP)',
    group: 'getting-started',
    path: '/login',
    keywords: ['login', 'otp', 'password', 'code', 'email'],
    body:
      `LiveEdge is fully passwordless. You sign in with your username (or email), receive a 6-digit code by email, and that signs you in for 7 days.\n\nIf you don't receive the code: check your spam folder, then try resending. Codes expire after 10 minutes and are limited to 3 requests per 15 minutes per email. If you still don't get one, report it via Help → Report an Issue.`,
    steps: [
      'Open the sign-in page and enter your username (or email).',
      'Click "Send code." Watch your email for a 6-digit code.',
      'Type the code into LiveEdge to finish signing in.',
      'Sessions last 7 days — you stay signed in across browser sessions.',
    ],
  },
  {
    id: 'branch-switcher',
    title: 'Branch switcher',
    group: 'getting-started',
    keywords: ['branch', 'location', 'fort dodge', 'grimes', 'birchwood', 'coralville'],
    body:
      `Your active branch determines which data you see by default — picks, deliveries, POs, customers, etc. Admins can switch to "All Branches" to see everything.\n\nThe switcher lives in the top-right of the nav bar with a colored dot per branch: violet (All), red (Fort Dodge), green (Grimes), gold (Birchwood), black (Coralville). Your selection is saved in a cookie and persists across sessions.`,
  },
  {
    id: 'global-search',
    title: 'Global search & keyboard shortcuts',
    group: 'getting-started',
    keywords: ['search', 'find', 'shortcut', 'cmd-k', 'ctrl-k'],
    body:
      `Click the magnifying glass in the top nav, or press Ctrl+K (Cmd+K on Mac) from anywhere. The global search hits customers, bids, designs, and EWP records. Results are clickable — pick one to jump straight to its detail page.\n\nFor SO numbers and POs, the more specific tools work better: Sales → Transactions for SO search, Purchasing → Open POs for PO search.`,
  },
  {
    id: 'reporting-issues',
    title: 'Reporting an issue or requesting a feature',
    group: 'getting-started',
    path: '/it-issues',
    keywords: ['help', 'support', 'bug', 'feedback', 'feature request', 'it'],
    body:
      `If something is broken or you want to suggest an improvement, click your name in the top-right and choose "Report an Issue." Fill in what page you were on, what you expected, and what actually happened — including any error messages or screenshots if you can get them.\n\nIT will see the issue in the queue and route it to the right person. You can revisit your submitted issues at any time from the same page.`,
  },
  {
    id: 'top-nav-overview',
    title: 'Top nav overview',
    group: 'getting-started',
    keywords: ['menu', 'navigation', 'dropdown'],
    body:
      `The top nav has the following dropdowns (visibility depends on your role): Yard · Dispatch · Sales · Management · Services · Purchasing · Admin (admin only). Your name in the top-right opens a personal menu with Report an Issue, Help & Docs, and Sign Out.\n\nAll dropdowns close when you click outside them. On mobile (below "lg" breakpoint) the whole nav collapses into a hamburger menu.`,
  },

  // ─── Home & Dashboard ────────────────────────────────────────────
  {
    id: 'home-dashboard',
    title: 'Personalized homepage',
    group: 'home',
    path: '/',
    keywords: ['home', 'dashboard', 'kpi'],
    body:
      `The homepage is your personalized landing. It greets you with today's date and your active branch, shows 5 KPI tiles (open bids, designs, picks, work orders, sales orders), a Quick Access strip of pages you visit most, 8 module cards, and a recent activity feed.\n\nKPIs are scoped to your branch unless you're set to "All Branches." Click any tile or module card to drill in.`,
  },
  {
    id: 'quick-access',
    title: 'Quick Access strip',
    group: 'home',
    keywords: ['shortcut', 'frequent', 'recent'],
    body:
      `Quick Access surfaces the pages you've visited most often. The list builds up over time as you use LiveEdge — the more you use a page, the higher it ranks. Use it as a custom shortcut row to your daily workflow.`,
  },

  // ─── Yard ─────────────────────────────────────────────────────────
  {
    id: 'picks-board',
    title: 'Picks Board',
    group: 'yard',
    path: '/warehouse',
    keywords: ['picks', 'warehouse', 'yard', 'pulling'],
    body:
      `The Picks Board shows all active pick jobs for your branch grouped by status, refreshed every 60 seconds. Use it during a shift to see what's being pulled, who has it, and where each job stands.\n\nClick a row to open the SO detail in the warehouse view (line items, picks, shipments, assigned picker). The board pulls from the live ERP via the agility_picks layer.`,
  },
  {
    id: 'open-picks',
    title: 'Open Picks',
    group: 'yard',
    path: '/warehouse/open-picks',
    keywords: ['active', 'pickers'],
    body:
      `Open Picks shows which pickers are currently active and how many lines they've processed today and over the past 5 days. Use it to balance work across the floor — if one picker is loaded up and another is idle, reassign.`,
  },
  {
    id: 'picker-stats',
    title: 'Picker Stats',
    group: 'yard',
    path: '/warehouse/picker-stats',
    keywords: ['performance', 'metrics', 'review'],
    body:
      `Aggregate picker performance over a configurable window (default 30 days, range 1–365). Shows total lines, average time per pick, and total picks. Useful for weekly or monthly reviews.`,
  },
  {
    id: 'work-orders',
    title: 'Work Orders',
    group: 'yard',
    path: '/work-orders',
    keywords: ['wo', 'manufacture', 'assembly'],
    body:
      `The Work Orders page shows open WOs from the ERP. You can search by SO number (works with a barcode scanner), assign pickers/technicians, and mark orders complete.\n\nWork orders are pulled from agility_wo_header — they cover assemblies, builds, and value-added shop work.`,
  },
  {
    id: 'supervisor-view',
    title: 'Supervisor View',
    group: 'yard',
    path: '/supervisor',
    roles: ['supervisor', 'ops', 'warehouse'],
    keywords: ['supervisor', 'status', 'board'],
    body:
      `The Supervisor view is a real-time picker status board (Active / Assigned / Idle) that refreshes every 30 seconds. Visible to users with supervisor, ops, or warehouse roles. Use it from the supervisor desk during a shift to see who's working and who needs a job.`,
  },
  {
    id: 'tv-board',
    title: 'TV Board',
    group: 'yard',
    path: '/tv/[branch]',
    roles: ['supervisor', 'ops', 'warehouse'],
    keywords: ['display', 'public', 'screen'],
    body:
      `The TV Board is a public, full-screen pick display formatted for warehouse TVs. It needs no login — point a screen at the URL for your branch and let it run. Linked from the Yard menu under "Kiosks."`,
  },
  {
    id: 'pick-tracker-kiosk',
    title: 'Pick Tracker Kiosk',
    group: 'yard',
    path: '/kiosk/[branch]',
    roles: ['supervisor', 'ops', 'warehouse'],
    keywords: ['kiosk', 'floor', 'terminal'],
    body:
      `The Kiosk is a floor-level pick assignment terminal — pickers can claim jobs and mark them complete from a shared station. Login is optional for kiosk-only use.`,
  },
  {
    id: 'picker-admin',
    title: 'Picker Admin',
    group: 'yard',
    path: '/warehouse/pickers',
    roles: ['supervisor', 'ops', 'admin'],
    keywords: ['add picker', 'edit picker', 'roster'],
    body:
      `Add, edit, or deactivate pickers. Click a picker to see their recent pick history and performance stats. Branch-scoped for non-admins.`,
  },

  // ─── Dispatch & Delivery ─────────────────────────────────────────
  {
    id: 'dispatch-board',
    title: 'Dispatch Board',
    group: 'dispatch',
    path: '/dispatch',
    keywords: ['routes', 'stops', 'delivery'],
    body:
      `The Dispatch Board shows today's delivery stops pulled live from the ERP. Build routes, assign stops to trucks/drivers, reorder stops, and track progress through the day.\n\nClick a stop to open its detail panel — order info, ship-to address, line items, and timeline. Routes can be saved and copied forward to the next day.`,
    steps: [
      'Pick the date you are planning for (defaults to today).',
      'Drag stops onto a route or click "Add to route." Reorder by dragging.',
      'Assign a truck and driver from the Driver Roster dropdown.',
      'Save. Drivers see their assigned route on the Driver Mobile view.',
    ],
  },
  {
    id: 'branch-transfers',
    title: 'Branch Transfers',
    group: 'dispatch',
    path: '/dispatch/transfers',
    keywords: ['transfer', 'inter-branch', 'between branches'],
    body:
      `Branch Transfers shows outbound transfers from your branch to another (open SOs with sale_type=T) and inbound transfers from other Beisser branches (open POs where the supplier is another branch).\n\nUse it to coordinate movement of stock between Fort Dodge, Grimes, Birchwood, and Coralville. Branch-scoped for non-admin; admins can see all.`,
  },
  {
    id: 'driver-roster',
    title: 'Driver Roster',
    group: 'dispatch',
    path: '/dispatch/drivers',
    roles: ['supervisor', 'ops', 'dispatch'],
    keywords: ['driver', 'add driver', 'truck'],
    body:
      `Manage drivers and trucks. Add a new driver, mark them active or inactive, and assign default trucks. Drivers appear in the route assignment dropdowns on the Dispatch Board.`,
  },
  {
    id: 'delivery-tracker',
    title: 'Delivery Tracker',
    group: 'dispatch',
    path: '/delivery',
    keywords: ['kps', 'keyed', 'picked', 'shipped', 'overdue'],
    body:
      `The Delivery Tracker shows today's and overdue deliveries with K/P/S status (Keyed / Picked / Shipped). It includes a fleet GPS panel powered by Samsara so you can see where each truck is.\n\nA red status badge means the order is overdue based on its requested delivery date.`,
  },
  {
    id: 'fleet-map',
    title: 'Fleet Map',
    group: 'dispatch',
    path: '/delivery/map',
    keywords: ['gps', 'samsara', 'truck location'],
    body:
      `Live Samsara GPS for all vehicles — speed, address, and last update time per truck. Refreshes about every 15 seconds. Useful for the dispatcher's desk and for sales staff fielding "where's my delivery?" calls.`,
  },
  {
    id: 'pod-viewer',
    title: 'Proof of Delivery (POD) Viewer',
    group: 'dispatch',
    path: '/dispatch/pod/[so]',
    keywords: ['pod', 'signature', 'proof of delivery'],
    body:
      `Each delivered SO has a POD record with photos and a signature. Open the POD viewer from the Dispatch Board or directly via the SO number. PODs are stored in Cloudflare R2 and submitted via the Driver Mobile view.`,
  },
  {
    id: 'driver-mobile',
    title: 'Driver Mobile',
    group: 'dispatch',
    path: '/driver',
    keywords: ['driver app', 'mobile', 'route'],
    body:
      `The Driver Mobile view is the in-cab interface for delivery drivers. They see their assigned route, can swipe through stops, capture POD photos and signatures, and mark stops delivered. The page is mobile-first and works in a phone browser.`,
  },
  {
    id: 'delivery-report',
    title: 'Delivery Report (Ops)',
    group: 'dispatch',
    path: '/ops/delivery-reporting',
    roles: ['supervisor', 'ops'],
    keywords: ['analytics', 'report', 'csv', 'chart'],
    body:
      `ERP analytics for deliveries. Bar chart by date, filterable by branch and date range, with CSV export. Visible to supervisors and ops users — useful for board meetings or end-of-month reporting.`,
  },

  // ─── Sales ───────────────────────────────────────────────────────
  {
    id: 'sales-hub',
    title: 'Sales Hub',
    group: 'sales',
    path: '/sales',
    keywords: ['kpi', 'dashboard'],
    body:
      `The Sales Hub is the daily landing for sales staff. KPI cards (open orders, revenue, recent activity) plus a status table. Branch-scoped — set "All Branches" to see company-wide.`,
  },
  {
    id: 'customers',
    title: 'Customer search & profile',
    group: 'sales',
    path: '/sales/customers',
    keywords: ['customer', 'lookup', 'shipto'],
    body:
      `Search by customer name or code. Click a customer to open the profile, which has tabs for Open Orders, 90-day History, Ship-To Addresses, and Notes.\n\nNotes are internal-only and shared across all sales staff. Use them for credit holds, account quirks, delivery preferences, and key contacts. Notes are stored in the customer_notes table and never sent to the customer.`,
  },
  {
    id: 'transactions',
    title: 'Transactions (SO search)',
    group: 'sales',
    path: '/sales/transactions',
    keywords: ['order', 'so', 'sales order', 'search'],
    body:
      `Full-screen sales order search. Filter by status, date range, sale type (Order, Quote, Credit, Transfer), branch, or customer. Pagination at the bottom. Click any SO number to open the order detail.`,
  },
  {
    id: 'order-detail',
    title: 'Sales Order detail',
    group: 'sales',
    path: '/sales/orders/[so_number]',
    keywords: ['so detail', 'line items', 'invoice'],
    body:
      `Each SO detail page shows the header (customer, ship-to, terms, status), line items with prices and quantities, shipment history (with invoice and ship dates), and an estimated total. The customer name links to the customer profile; the SO ties back to picks and POD on the warehouse and dispatch sides.`,
  },
  {
    id: 'purchase-history',
    title: 'Purchase History',
    group: 'sales',
    path: '/sales/history',
    keywords: ['invoiced', 'closed', 'past orders'],
    body:
      `Invoiced and closed orders. Filter by customer, date range, and branch. Use it to look up "what did Jane order last spring?" — and click into any SO for the full detail.`,
  },
  {
    id: 'products-stock',
    title: 'Products & Stock',
    group: 'sales',
    path: '/sales/products',
    keywords: ['item', 'sku', 'inventory', 'qty', 'on hand'],
    body:
      `Search the item catalog by code or description. Results show on-hand quantities per branch and handling codes from agility_items.\n\nThis view shows mirror-table data (refreshed daily). For real-time pricing or availability before quoting, use the live price-check (admin/agility tools).`,
  },
  {
    id: 'sales-tracker',
    title: 'Sales Tracker',
    group: 'sales',
    path: '/sales/tracker',
    roles: ['sales', 'ops', 'supervisor'],
    keywords: ['delivery', 'tracker', 'eta'],
    body:
      `Sales-rep view of deliveries — same data source as the Delivery Tracker, formatted for sales staff fielding customer "where's my order?" questions. Shows K/P/S status and ETA.`,
  },
  {
    id: 'rma-credits',
    title: 'RMA Credits',
    group: 'sales',
    path: '/credits',
    keywords: ['credit memo', 'return', 'rma'],
    body:
      `RMA Credits lists open credit memos (sale_type=Credit) for your branch. Search by CM number, customer, reference, or PO. Each credit can have attached photos/PDFs which arrive via inbound email to *@rma.beisser.cloud and store automatically in R2.\n\nBranch-scoped for non-admin; admins see all branches or can filter. Status badges: Open (blank), Staged (S), Closed/Other (gray).`,
  },

  // ─── Management & Scorecard ──────────────────────────────────────
  {
    id: 'management-hub',
    title: 'Management Hub',
    group: 'management',
    path: '/management',
    keywords: ['executive', 'leadership', 'overview'],
    body:
      `The Management Hub is the entry point for management-level reporting. Quick links to all scorecards, KPI summaries, and report exports. Branch context applies — switch to "All Branches" for company-wide totals.`,
  },
  {
    id: 'scorecard-overview',
    title: 'Company Overview Scorecard',
    group: 'management',
    path: '/scorecard/overview',
    keywords: ['scorecard', 'company', 'totals'],
    body:
      `Company-wide scorecard: revenue, gross margin, order counts, and trend over time. Drill in by clicking a metric to see the supporting detail.`,
  },
  {
    id: 'scorecard-branch',
    title: 'Branch Scorecard',
    group: 'management',
    path: '/scorecard/branch/[branch]',
    keywords: ['scorecard', 'location', 'branch'],
    body:
      `Per-branch scorecard. Pick a branch to see its individual revenue, margin, and activity metrics. Useful for comparing locations side by side.`,
  },
  {
    id: 'scorecard-rep',
    title: 'Sales Rep Scorecard',
    group: 'management',
    path: '/scorecard/rep',
    keywords: ['rep', 'salesperson', 'commission'],
    body:
      `Per-sales-rep scorecard — total bookings, gross margin, customer count, and order count. Used for sales reviews and commission discussion.`,
  },
  {
    id: 'scorecard-product',
    title: 'Product Group Scorecard',
    group: 'management',
    path: '/scorecard/product',
    keywords: ['product', 'category', 'group'],
    body:
      `Performance by product group. Identify which categories drive the most revenue and which are underperforming. Filter by branch and date range.`,
  },
  {
    id: 'customer-scorecard',
    title: 'Customer Scorecard',
    group: 'management',
    path: '/scorecard',
    keywords: ['customer scorecard', 'top customers'],
    body:
      `Per-customer ranking and detail. Use for top-customer reviews and to spot accounts that have slowed or grown. Click a customer to see the full profile.`,
  },
  {
    id: 'sales-reports',
    title: 'Sales Reports',
    group: 'management',
    path: '/sales/reports',
    keywords: ['report', 'top customers', 'export'],
    body:
      `Daily orders chart, top customers, breakdown by sale type and ship-via, and status breakdowns. Exportable for further analysis.`,
  },

  // ─── Services (Estimating & Design) ──────────────────────────────
  {
    id: 'estimating-app',
    title: 'Estimating App',
    group: 'services',
    path: '/estimating',
    keywords: ['estimator', 'bid', 'inputs', 'formula'],
    body:
      `The Estimating App is the main interface for creating and managing bids. It provides takeoff input forms (basement, floors, roof, siding, deck, trim, windows, doors), formula-driven calculations, and links to PDF takeoff sessions.\n\nVisit /estimating directly, or open a bid from /bids and pick "Estimating App." Bid Fields visibility is controlled by Admin → Bid Fields.`,
  },
  {
    id: 'pdf-takeoff-overview',
    title: 'PDF Takeoff overview',
    group: 'services',
    path: '/takeoff',
    keywords: ['takeoff', 'pdf', 'measure', 'bluebeam'],
    body:
      `PDF Takeoff replaces Bluebeam Revu. Upload a construction PDF, calibrate scale, and measure directly on the drawing — linear footage (polyline), areas (polygon), and counts (point). Measurements live in named groups that map back to JobInputs fields.\n\nClick "Send to Estimate" when ready to write totals back to the linked bid's inputs.`,
  },
  {
    id: 'takeoff-upload',
    title: 'Uploading a PDF',
    group: 'services',
    keywords: ['upload', 'pdf', 'r2', 'file'],
    body:
      `From a takeoff session, click "Upload PDF" and pick the file. Files up to about 4.5 MB upload directly via the proxy; larger files use a presigned URL straight to R2 storage. The file is then bound to the session and stays available across reloads.\n\nIf upload fails, check your network and try again — the page shows a banner with the error if R2 rejects the upload.`,
  },
  {
    id: 'takeoff-tools',
    title: 'Measurement tools & presets',
    group: 'services',
    keywords: ['preset', 'tool', 'polyline', 'polygon', 'count'],
    body:
      `The sidebar holds preset buttons (e.g. "1st Floor Ext 2x6 9'") that activate the right tool with the right color. Polyline tools measure linear footage; polygon tools measure area; point tools count items.\n\nKeyboard / mouse: scroll wheel zooms, hold middle-mouse or space+drag to pan, click to start a polyline/polygon, double-click or Enter to finish, Escape to cancel. Click on an existing measurement to inspect or delete it.`,
  },
  {
    id: 'takeoff-calibration',
    title: 'Scale calibration & viewports',
    group: 'services',
    keywords: ['scale', 'calibrate', 'viewport', '1/4 inch'],
    body:
      `Each viewport on a page can have its own scale. Pick a preset (1/8" = 1', 1/4" = 1', etc.) or calibrate manually by drawing a line of known length. Drawings with multiple scales (e.g. plan + detail) need a viewport per scale — define them with the viewport tool.\n\nDefault new viewports use the page's last calibration; uncalibrated viewports show measurements in pixels until you set a scale.`,
  },
  {
    id: 'takeoff-send-to-estimate',
    title: 'Send to Estimate',
    group: 'services',
    keywords: ['estimate', 'sync', 'jobinputs'],
    body:
      `When you're done measuring, click "Send to Estimate." Each preset has a targetField that maps to a specific JobInputs field on the linked bid (e.g. firstFloor.ext2x6_9ft). Totals from each preset write back to that field, replacing any prior value.\n\nIf the takeoff isn't linked to a bid yet, link it first (from the takeoff session list, or by clicking "Start Takeoff" on a legacy bid).`,
  },
  {
    id: 'bids-hub',
    title: 'Bids hub',
    group: 'services',
    path: '/bids',
    keywords: ['bid', 'quote', 'estimate', 'incomplete', 'completed'],
    body:
      `The Bids hub has four tabs driven by the ?tab= query param:\n• Open — incomplete legacy bids\n• Completed — closed legacy bids with turnaround days\n• All — unified legacy + estimator bids\n• Projects — newer UUID-based estimator bids with workflow buttons (draft → submitted → won/lost/archived)\n\nDetail and add pages still live at /legacy-bids/[id] and /legacy-bids/add — internal links continue to work.`,
  },
  {
    id: 'start-takeoff',
    title: 'Start a takeoff from a bid',
    group: 'services',
    keywords: ['link', 'bid', 'takeoff', 'session'],
    body:
      `Open a legacy bid and click "Start Takeoff." This creates a UUID-based bid record plus a takeoff session, copying the bid's spec flags (framing, siding, shingles, deck, trim, windows, doors) so the relevant measurement presets are pre-loaded.\n\nIf the bid already has a session, the button reads "Open Takeoff" and links straight to the workspace.`,
  },
  {
    id: 'ewp',
    title: 'EWP (Engineered Wood Products)',
    group: 'services',
    path: '/ewp',
    keywords: ['ewp', 'beam', 'truss', 'joist'],
    body:
      `EWP tracks engineered wood orders — beams, joists, trusses. Add records manually or bulk-import from CSV. Each EWP has activity logged in the general audit table.\n\nBranch-scoped. Activity tracked through the audit log so you can see who changed what.`,
  },
  {
    id: 'projects',
    title: 'Projects',
    group: 'services',
    path: '/projects',
    keywords: ['project', 'job'],
    body:
      `Projects is a lightweight container for grouping work. Use it when a single customer job spans multiple bids, takeoffs, EWPs, or designs and you need a parent record to track them all.`,
  },
  {
    id: 'design',
    title: 'Design',
    group: 'services',
    path: '/designs',
    keywords: ['design', 'plan', 'designer'],
    body:
      `Design tracks design projects with auto-generated plan numbers (D-YYMM-NNN). Each design ties to a customer and has its own activity log. Use it to manage the design queue separately from the estimating queue.`,
  },

  // ─── Purchasing & Receiving ──────────────────────────────────────
  {
    id: 'buyer-workspace',
    title: 'Buyer Workspace',
    group: 'purchasing',
    path: '/purchasing/workspace',
    roles: ['purchasing', 'ops', 'supervisor'],
    keywords: ['buyer', 'daily', 'queue'],
    body:
      `The Buyer Workspace is the purchasing team's daily landing — quick-action cards, upcoming POs, and recent check-ins at a glance.`,
  },
  {
    id: 'open-pos',
    title: 'Open POs',
    group: 'purchasing',
    path: '/purchasing/open-pos',
    keywords: ['po', 'purchase order', 'overdue'],
    body:
      `All open purchase orders with overdue highlighting. Click a PO for full line-item detail, received quantities, and check-in shortcut.`,
  },
  {
    id: 'po-detail',
    title: 'PO Detail',
    group: 'purchasing',
    path: '/purchasing/pos/[po]',
    keywords: ['po detail', 'lines', 'received'],
    body:
      `Each PO detail page shows the header, line items with received quantities, and a shortcut to start a check-in for any partial or unreceived lines. Internal notes can be added per PO.`,
  },
  {
    id: 'suggested-buys',
    title: 'Suggested Buys',
    group: 'purchasing',
    path: '/purchasing/suggested-buys',
    roles: ['purchasing', 'ops', 'supervisor'],
    keywords: ['replenishment', 'min max', 'suggested po'],
    body:
      `Replenishment suggestions from the ERP — items below their reorder point with proposed PO quantities. Convert a suggestion to a real PO directly from the page.`,
  },
  {
    id: 'po-exceptions',
    title: 'PO Exceptions',
    group: 'purchasing',
    path: '/purchasing/exceptions',
    roles: ['purchasing', 'ops', 'supervisor'],
    keywords: ['exception', 'late', 'short ship'],
    body:
      `Late POs and quantity anomalies — short ships, over ships, items overdue past their promised date. The buyer's alert queue.`,
  },
  {
    id: 'command-center',
    title: 'Purchasing Command Center',
    group: 'purchasing',
    path: '/purchasing/manage',
    roles: ['purchasing', 'ops', 'supervisor'],
    keywords: ['kpi', 'manage', 'overdue'],
    body:
      `Ops-level overview for purchasing managers: KPI cards, POs by branch, overdue list, and recent submissions.`,
  },
  {
    id: 'po-checkin',
    title: 'PO Check-In (Receiving)',
    group: 'purchasing',
    path: '/purchasing',
    keywords: ['receive', 'checkin', 'photos', 'receiving'],
    body:
      `The PO Check-In is the multi-step receiving workflow. Scan or enter a PO number, verify line items, adjust received quantities, and submit. You can attach photos of the shipment — they store in R2 and appear in the Review Queue.`,
    steps: [
      'Open Purchasing → PO Check-In and scan or enter the PO number.',
      'Confirm the supplier and the lines on the PO.',
      'Adjust received quantities for each line. Note any short-ships or damage.',
      'Take photos if relevant (damage, packing list, label).',
      'Submit. The check-in moves to the Review Queue.',
    ],
  },
  {
    id: 'review-queue',
    title: 'Receiving Review Queue',
    group: 'purchasing',
    path: '/purchasing/review',
    roles: ['purchasing', 'ops', 'supervisor'],
    keywords: ['review', 'flagged', 'photos'],
    body:
      `Submitted check-ins land here for review. Filter by status, branch, or date. Open a submission to view photos, add reviewer notes, and mark it Reviewed or Flagged.`,
  },

  // ─── Admin ───────────────────────────────────────────────────────
  {
    id: 'admin-dashboard',
    title: 'Admin Dashboard',
    group: 'admin',
    path: '/admin',
    roles: ['admin'],
    keywords: ['admin', 'overview'],
    body:
      `The Admin Dashboard is the entry to all admin tools. Sidebar is grouped: General · Services · Users · Operations · System. Mobile-friendly — sidebar collapses to a hamburger drawer.`,
  },
  {
    id: 'admin-customers',
    title: 'Admin Customers',
    group: 'admin',
    path: '/admin/customers',
    roles: ['admin'],
    keywords: ['customer admin', 'legacy customer'],
    body:
      `The internal legacy customer table (used for bids and designs — distinct from the ERP customer master). Add, edit, or import customers via CSV. Click a customer to see their bids, designs, and EWP records in one view.`,
  },
  {
    id: 'admin-products',
    title: 'Products / SKUs',
    group: 'admin',
    path: '/admin/products',
    roles: ['admin'],
    keywords: ['sku', 'product', 'internal product'],
    body:
      `Internal product catalog (separate from the ERP item master). Used by the Estimating App for items that don't have an ERP SKU yet.`,
  },
  {
    id: 'admin-formulas',
    title: 'Formulas',
    group: 'admin',
    path: '/admin/formulas',
    roles: ['admin'],
    keywords: ['formula', 'calculation', 'math'],
    body:
      `Configure the math used by the Estimating App — quantity formulas for lumber, fasteners, sheathing, etc. Changes take effect on the next estimate.`,
  },
  {
    id: 'admin-bid-fields',
    title: 'Bid Fields',
    group: 'admin',
    path: '/admin/bid-fields',
    roles: ['admin'],
    keywords: ['fields', 'bid form', 'visibility'],
    body:
      `Control which input fields appear in the Estimating App, which are required, and how they're grouped. Useful when the spec changes or you want to hide a field that's no longer used.`,
  },
  {
    id: 'admin-users',
    title: 'Users & Permissions',
    group: 'admin',
    path: '/admin/users',
    roles: ['admin'],
    keywords: ['user', 'permission', 'role', 'access'],
    body:
      `Single source of truth for auth — backed by public.app_users. Add a user, edit their roles array (admin, estimator, purchasing, dispatch, ops, warehouse, supervisor, sales), set their default branch, and toggle active/inactive.\n\nClick a user → Permissions to manage their role assignments. There's no password field — auth is OTP-only on the web side.`,
  },
  {
    id: 'admin-notifications',
    title: 'Notifications',
    group: 'admin',
    path: '/admin/notifications',
    roles: ['admin'],
    keywords: ['notification', 'announcement', 'banner'],
    body:
      `Create system-wide notifications and announcements. Configure delivery (push, in-app banner) and audience (all users, by branch, by role).`,
  },
  {
    id: 'admin-job-review',
    title: 'Job Review',
    group: 'admin',
    path: '/admin/jobs',
    roles: ['admin'],
    keywords: ['job', 'gps', 'shipto', 'address'],
    body:
      `Review ERP sales order jobs by GPS match status. Quick-filter chips: Recently Created · Recently Matched GPS · Missing GPS · Has GPS Match. Click an SO to see the customer, order, GPS coordinates, and a Leaflet map pinned at the ship-to address.\n\nUse it to find ship-tos missing GPS and forward corrections to accounting. Future work will add direct write-back to Agility for tax codes and address fixes.`,
  },
  {
    id: 'admin-hubbell',
    title: 'Hubbell Reconciliation',
    group: 'admin',
    path: '/admin/hubbell',
    roles: ['admin'],
    keywords: ['hubbell', 'email', 'reconcile', 'po confirmation'],
    body:
      `Reconcile inbound Hubbell supply-house emails (PO confirmations, WO acknowledgements) against LiveEdge sales orders. Tabs: Pending · Matched · Confirmed · No Match · Rejected. Open an email to see the extracted data, candidate matches sorted by confidence, and Confirm / Reject / Reset actions.\n\nThe Jobs view aggregates confirmed emails by job site (customer + address) so you can see all the Hubbell traffic for one project at a glance.`,
  },
  {
    id: 'admin-audit',
    title: 'Audit Log',
    group: 'admin',
    path: '/admin/audit',
    roles: ['admin'],
    keywords: ['audit', 'history', 'who changed'],
    body:
      `System-wide activity log — bid edits, user changes, design updates, EWP changes, etc. Each entry has a timestamp, user, model, and a JSONB change blob with before/after values.`,
  },
  {
    id: 'admin-erp',
    title: 'ERP Sync',
    group: 'admin',
    path: '/admin/erp',
    roles: ['admin'],
    keywords: ['erp', 'sync', 'agility', 'mirror'],
    body:
      `Connection status to the Supabase ERP database, table introspection, data preview, manual customer sync, and sync history. Auto-sync runs daily at 06:00 UTC via cron.\n\nThe Agility live API can be tested here too — Login → Version → BranchList → Logout.`,
  },
  {
    id: 'admin-analytics',
    title: 'Page Analytics',
    group: 'admin',
    path: '/admin/analytics',
    roles: ['admin'],
    keywords: ['analytics', 'visits', 'usage'],
    body:
      `System usage analytics — page visits, module activity, most-used features. Backed by the page_visits table.`,
  },

  // ─── Workflows ───────────────────────────────────────────────────
  {
    id: 'workflow-bid-to-takeoff',
    title: 'Create a bid → run a takeoff → send to estimate',
    group: 'workflows',
    keywords: ['bid', 'takeoff', 'workflow'],
    body:
      `End-to-end estimating workflow. The takeoff stays linked to the bid the whole way, so measurements feed directly into the estimate.`,
    steps: [
      'Services → Bids → Open tab → "Add Bid."',
      'Fill in customer, job name, address, and spec flags (framing, siding, shingles, deck, trim, windows, doors).',
      'Save the bid, then open it and click "Start Takeoff."',
      'Upload the construction PDF in the takeoff workspace.',
      'Calibrate scale on each viewport (1/4" = 1\' is the most common).',
      'Use the sidebar presets to measure — polylines for LF, polygons for SF, points for counts.',
      'Click "Send to Estimate" when done. Totals write back to the bid inputs.',
    ],
  },
  {
    id: 'workflow-receive-po',
    title: 'Receive a PO shipment',
    group: 'workflows',
    keywords: ['receive', 'po', 'checkin', 'workflow'],
    body:
      `Standard PO check-in flow. Photos help the review queue and back up any short-ship claims.`,
    steps: [
      'Purchasing → PO Check-In.',
      'Scan or enter the PO number.',
      'Verify the supplier and the lines on the PO.',
      'Adjust received quantities — note anything short, over, or damaged.',
      'Attach photos if relevant.',
      'Submit. The check-in moves to the Review Queue for the buyer to confirm.',
    ],
  },
  {
    id: 'workflow-customer-history',
    title: 'Look up a customer\'s order history',
    group: 'workflows',
    keywords: ['customer', 'history', 'workflow'],
    body:
      `Quickest way to answer "what did Jane order last spring?".`,
    steps: [
      'Sales → Customers.',
      'Search by name or code, click the customer.',
      'Open the History tab to see invoiced and closed orders.',
      'Click any SO number for the full order detail.',
    ],
  },
  {
    id: 'workflow-build-route',
    title: 'Build a delivery route',
    group: 'workflows',
    keywords: ['route', 'dispatch', 'workflow'],
    body:
      `Plan tomorrow's deliveries.`,
    steps: [
      'Dispatch → Dispatch Board, pick the date.',
      'Drag stops onto a route or click "Add to route."',
      'Reorder stops by dragging.',
      'Assign a truck and driver.',
      'Save. Driver sees the route on Driver Mobile when they sign in.',
    ],
  },
  {
    id: 'workflow-monitor-yard',
    title: 'Monitor the yard during a shift',
    group: 'workflows',
    keywords: ['yard', 'shift', 'supervisor', 'workflow'],
    body:
      `Supervisor walking-around routine.`,
    steps: [
      'Start at the Picks Board to see all active picks.',
      'Check Open Picks for picker-by-picker progress.',
      'Use Supervisor View for a real-time status board (refreshes every 30s).',
      'Check Work Orders for any WOs that need a picker assigned.',
    ],
  },
  {
    id: 'workflow-hubbell',
    title: 'Reconcile a Hubbell email to a sales order',
    group: 'workflows',
    keywords: ['hubbell', 'reconcile', 'workflow'],
    body:
      `Match an inbound Hubbell PO confirmation to the right SO.`,
    steps: [
      'Admin → Hubbell, open the Pending tab.',
      'Click an email. Review the extracted PO #, SO #, and customer.',
      'Pick the best candidate from the suggested matches.',
      'Click Confirm to lock the match. The email moves to the Confirmed tab.',
      'Use Jobs view to see all confirmed Hubbell traffic for a single job site.',
    ],
  },
  {
    id: 'workflow-bid-to-erp',
    title: 'Push a bid to ERP as a quote, then promote to SO',
    group: 'workflows',
    keywords: ['quote', 'erp', 'agility', 'workflow', 'estimator'],
    body:
      `Estimator-only flow. Pushes the bid into Agility as a Quote first, then releases it as a real Sales Order when the customer confirms.`,
    steps: [
      'Open the bid in /legacy-bids/[id].',
      'Click "Push to ERP." Pick "Quote" to create a quote in Agility.',
      'Send the quote PDF to the customer for approval.',
      'When approved, return to the bid and click "Promote Quote to SO." Agility releases the quote as an order.',
    ],
  },

  // ─── Troubleshooting & FAQ ───────────────────────────────────────
  {
    id: 'tr-otp',
    title: 'I never received the sign-in code',
    group: 'troubleshooting',
    keywords: ['otp', 'email', 'code', 'login'],
    body:
      `Check your spam/junk folder first — the email comes from noreply@beisserlumber.com. Codes expire after 10 minutes; request a new one if it's been longer. Rate limit is 3 codes per 15 minutes per email.\n\nIf nothing arrives after a few tries, your account may have a typo in the email field. Ask an admin to check Admin → Users for your record, or report an issue.`,
  },
  {
    id: 'tr-stale-data',
    title: 'My data looks stale or out of date',
    group: 'troubleshooting',
    keywords: ['stale', 'sync', 'erp', 'refresh'],
    body:
      `Most operational data (picks, deliveries, POs) is live. Customer and item master tables sync from Agility nightly at 06:00 UTC, so changes made in Agility today won't show up until tomorrow morning. Admins can trigger a manual sync at Admin → ERP Sync if needed.\n\nSales Order detail and PO live status both have "live" endpoints that hit Agility directly — use those when freshness matters.`,
  },
  {
    id: 'tr-takeoff-zoom',
    title: 'Takeoff zoom or pan isn\'t working',
    group: 'troubleshooting',
    keywords: ['takeoff', 'zoom', 'pan', 'wheel'],
    body:
      `Known issue tracking. Workarounds: try selecting any markup first, then scroll-wheel to zoom. Hold middle-mouse or space+drag to pan. If the canvas appears collapsed (small in a tall white area), reload the page.\n\nIf the issue persists, report it via Help → Report an Issue with browser/OS details.`,
  },
  {
    id: 'tr-po-missing',
    title: 'A PO doesn\'t appear in PO Check-In',
    group: 'troubleshooting',
    keywords: ['po', 'missing', 'check in'],
    body:
      `PO Check-In pulls from the live Agility API. If a PO is missing: confirm it's not closed/cancelled in Agility, confirm your active branch matches the PO branch (use the branch switcher), and try the search bar with the bare PO number (no leading zeros).`,
  },
  {
    id: 'tr-wrong-branch',
    title: 'I\'m seeing data for the wrong branch',
    group: 'troubleshooting',
    keywords: ['branch', 'filter', 'data'],
    body:
      `Most pages are branch-scoped to your active branch. Check the branch switcher in the top-right — set it to "All Branches" if you need company-wide data (admins only), or pick the branch you actually meant.`,
  },
  {
    id: 'tr-credit-photos',
    title: 'RMA Credit shows 0 docs even though I emailed photos',
    group: 'troubleshooting',
    keywords: ['rma', 'credit', 'photo', 'attachment'],
    body:
      `Inbound emails to *@rma.beisser.cloud upload attachments to R2 and link them to a credit memo. The link only works if the RMA number can be parsed from the email subject or body. If your email didn't include the CM number, the photos are saved but unlinked.\n\nWorkaround: include the CM number in the subject line (e.g. "CM 123456 — damaged"). Report any persistent mismatches.`,
  },
];
