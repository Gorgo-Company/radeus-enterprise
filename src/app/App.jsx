import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import {
  getOperatorSession,
  getPortalSession,
  getStoredCustomer,
  getStoredStaff,
  signIn,
  signOut,
} from "../lib/auth";
import { MAPBOX_TOKEN, ORG_ID, SESSION_KEY, STAFF_KEY, SYSTEM_HQ } from "../lib/config";
import { select } from "../lib/supabase";

mapboxgl.accessToken = MAPBOX_TOKEN;

const NAV_ITEMS = [
  { label: "COMMAND", path: "/command" },
  { label: "ACCOUNTS", path: "/accounts" },
  { label: "READINGS", path: "/readings" },
  { label: "BILLING", path: "/billing" },
  { label: "COMPLY", path: "/compliance" },
  { label: "PAYMENTS", path: "/payments" },
  { label: "WO's", path: "/workorders" },
  { label: "REPORTS", path: "/reports" },
  { label: "COMMS", path: "/comms" },
  { label: "SYSTEM", path: "/system" },
];

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatCount(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function classifyBalance(balance, accountType, status) {
  const numeric = Number(balance || 0);
  if (status === "INACTIVE") return { label: "INACTIVE", tone: "muted" };
  if (status === "DISCONNECTED") return { label: "DISCONNECTED", tone: "danger" };
  if (accountType === "RELIGIOUS") return { label: "RELIGIOUS", tone: "muted" };
  if (numeric < -0.01) return { label: "CREDIT", tone: "info" };
  if (Math.abs(numeric) < 0.01) return { label: "CURRENT", tone: "success" };
  if (numeric > 500) return { label: "CRITICAL", tone: "danger" };
  return { label: "PAST DUE", tone: "warning" };
}

function toneClass(tone) {
  return `tone-${tone || "info"}`;
}

function useClock() {
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString("en-US", { hour12: false }),
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setClock(new Date().toLocaleTimeString("en-US", { hour12: false }));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return clock;
}

function useAuthState() {
  const [operatorSession, setOperatorSession] = useState(() => getOperatorSession());
  const [staff, setStaff] = useState(() => getStoredStaff());

  function refresh() {
    setOperatorSession(getOperatorSession());
    setStaff(getStoredStaff());
  }

  async function logout() {
    await signOut();
    setOperatorSession(null);
    setStaff(null);
  }

  return { operatorSession, staff, refresh, logout };
}

function useSystems(token) {
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const data = await select(
          "water_systems",
          `?org_id=eq.${ORG_ID}&select=system_id,system_code,system_name,base_rate,energy_surcharge,late_fee_amount&order=system_name`,
          token,
        );
        if (active) setSystems(data || []);
      } catch {
        if (active) setSystems([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [token]);

  return { systems, loading };
}

function useAsyncData(loadFn, deps) {
  const [state, setState] = useState({ loading: true, error: "", data: null });

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: "", data: null });
    loadFn()
      .then((data) => {
        if (active) setState({ loading: false, error: "", data });
      })
      .catch((error) => {
        if (active) setState({ loading: false, error: error.message, data: null });
      });

    return () => {
      active = false;
    };
  }, deps);

  return state;
}

function PageLoader({ label }) {
  return <div className="empty-state">{label}</div>;
}

function EmptyState({ title, body }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function Panel({ title, actions, className = "", children }) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header className="panel-header">
        <div className="panel-title">{title}</div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function MetricStrip({ items }) {
  return (
    <div className="metric-strip">
      {items.map((item) => (
        <div className="metric-cell" key={item.label}>
          <span className="metric-label">{item.label}</span>
          <strong className={`metric-value ${item.tone ? toneClass(item.tone) : ""}`}>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function StatusPill({ label, tone }) {
  return <span className={`status-pill ${toneClass(tone)}`}>{label}</span>;
}

function StatRow({ label, value, tone }) {
  return (
    <div className="stat-row">
      <span>{label}</span>
      <strong className={tone ? toneClass(tone) : ""}>{value}</strong>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LegendRow({ label, tone }) {
  return (
    <div className="legend-row">
      <span className={`legend-dot ${toneClass(tone)}`} />
      <span>{label}</span>
    </div>
  );
}

function KpiMini({ label, value }) {
  return (
    <div className="kpi-mini">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DashboardLayout({
  pageTitle,
  subtitle,
  systems,
  selectedSystem,
  onSystemChange,
  tickerItems,
  staff,
  onSignOut,
  children,
}) {
  const clock = useClock();

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="wordmark">RADEUS</div>
        <div className="topbar-center">
          <div className="online-dot" />
          <span className="topbar-tag">{pageTitle}</span>
          <select
            className="system-select"
            value={selectedSystem}
            onChange={(event) => onSystemChange(event.target.value)}
          >
            {systems.map((system) => (
              <option key={system.value} value={system.value}>
                {system.label}
              </option>
            ))}
          </select>
        </div>
        <div className="topbar-meta">
          <span className="operator-label">
            OPERATOR: <strong>{staff?.name || "ADMIN"}</strong>
          </span>
          <button className="ghost-button" onClick={onSignOut}>
            Sign out
          </button>
          <span className="clock-readout">{clock}</span>
        </div>
      </header>

      <div className="ticker-bar">
        <span className="ticker-label">LIVE</span>
        <div className="ticker-track">
          {[...tickerItems, ...tickerItems].map((item, index) => (
            <span className="ticker-item" key={`${item}-${index}`}>
              {item}
            </span>
          ))}
        </div>
      </div>

      <main className="app-main">
        <div className="page-heading">
          <h1>{pageTitle}</h1>
          <p>{subtitle}</p>
        </div>
        {children}
      </main>

      <nav className="bottom-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.path} className="nav-link" to={item.path}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function OperationsMap({ points, fallbackCenter, filter = "all" }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: fallbackCenter || [-99.5, 31.0],
      zoom: fallbackCenter ? 10 : 5.8,
    });
    mapRef.current = map;
    map.on("load", () => {
      map.addSource("radeus-points", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 36,
      });
      map.addLayer({
        id: "radeus-clusters",
        type: "circle",
        source: "radeus-points",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["step", ["get", "point_count"], "#5aa8cf", 8, "#2f86b5", 20, "#cf6657"],
          "circle-radius": ["step", ["get", "point_count"], 16, 8, 22, 20, 30],
        },
      });
      map.addLayer({
        id: "radeus-cluster-count",
        type: "symbol",
        source: "radeus-points",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 11 },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "radeus-unclustered",
        type: "circle",
        source: "radeus-points",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "dot"],
          "circle-radius": 7,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [fallbackCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;
    const source = map.getSource("radeus-points");
    if (!source) return;

    const visiblePoints = points.filter((point) => {
      if (filter === "critical") return point.statusLabel === "CRITICAL";
      if (filter === "current") return point.statusLabel === "CURRENT";
      return true;
    });

    source.setData({
      type: "FeatureCollection",
      features: visiblePoints.map((point) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
        properties: { dot: point.dot },
      })),
    });

    if (visiblePoints.length) {
      const bounds = new mapboxgl.LngLatBounds();
      visiblePoints.forEach((point) => bounds.extend([point.longitude, point.latitude]));
      map.fitBounds(bounds, { padding: 42, maxZoom: 12, duration: 800 });
    } else if (fallbackCenter) {
      map.flyTo({ center: fallbackCenter, zoom: 10, duration: 800 });
    }
  }, [fallbackCenter, filter, mapReady, points]);

  return <div className="map-surface" ref={containerRef} />;
}

function useCommandData(token, selectedCode, systems) {
  return useAsyncData(async () => {
    if (selectedCode === "ALL") {
      const [accounts, balances, calls, compliance] = await Promise.all([
        select(
          "accounts",
          "?status=neq.INACTIVE&select=account_id,account_number,account_type,status,system_id,customers(full_name),service_addresses(street,latitude,longitude)&limit=1000",
          token,
        ),
        select("account_balances", "?select=account_id,current_balance,last_payment_date,last_payment_amount&limit=1000", token),
        select("communication_log", "?select=*&order=created_at.desc&limit=8", token).catch(() => []),
        select("compliance_events", "?select=*&order=due_date.asc&limit=8", token).catch(() => []),
      ]);

      const balanceMap = Object.fromEntries((balances || []).map((row) => [row.account_id, row]));
      const totals = { total: 0, current: 0, credit: 0, pastDue: 0, critical: 0 };
      const points = [];

      (accounts || []).forEach((account) => {
        const status = classifyBalance(balanceMap[account.account_id]?.current_balance, account.account_type, account.status);
        totals.total += 1;
        if (status.label === "CURRENT") totals.current += 1;
        if (status.label === "CREDIT") totals.credit += 1;
        if (status.label === "PAST DUE") totals.pastDue += 1;
        if (status.label === "CRITICAL") totals.critical += 1;
        if (account.service_addresses?.latitude && account.service_addresses?.longitude) {
          points.push({
            latitude: Number(account.service_addresses.latitude),
            longitude: Number(account.service_addresses.longitude),
            statusLabel: status.label,
            dot:
              status.label === "CRITICAL"
                ? "#cf6657"
                : status.label === "CURRENT"
                  ? "#3c9c74"
                  : status.label === "CREDIT"
                    ? "#5a9bd8"
                    : "#c8912f",
          });
        }
      });

      return {
        mode: "network",
        totals,
        points,
        systemRows: (systems || []).map((system) => {
          const rows = (accounts || []).filter((account) => account.system_id === system.system_id);
          const critical = rows.filter(
            (account) => Number(balanceMap[account.account_id]?.current_balance || 0) > 500,
          ).length;
          return {
            code: system.system_code,
            name: system.system_name,
            count: rows.length,
            critical,
          };
        }),
        calls: calls || [],
        compliance: compliance || [],
      };
    }

    const system = systems.find((entry) => entry.system_code === selectedCode);
    const [accounts, balances, calls, cycles, compliance] = await Promise.all([
      select(
        "accounts",
        `?system_id=eq.${system.system_id}&status=neq.INACTIVE&select=account_id,account_number,account_type,status,notes,customers(full_name,phone_primary,email),service_addresses(street,city,state,zip,latitude,longitude)&limit=700`,
        token,
      ),
      select("account_balances", `?system_id=eq.${system.system_id}&select=*`, token),
      select("communication_log", `?system_id=eq.${system.system_id}&select=*&order=created_at.desc&limit=8`, token).catch(() => []),
      select("billing_cycles", `?system_id=eq.${system.system_id}&order=cycle_year.desc,cycle_month.desc&limit=1`, token).catch(() => []),
      select("compliance_events", `?system_id=eq.${system.system_id}&select=*&order=due_date.asc&limit=8`, token).catch(() => []),
    ]);

    const balanceMap = Object.fromEntries((balances || []).map((row) => [row.account_id, row]));
    const totals = { total: 0, current: 0, credit: 0, pastDue: 0, critical: 0 };
    const rows = [];
    const points = [];

    (accounts || []).forEach((account) => {
      const balance = Number(balanceMap[account.account_id]?.current_balance || 0);
      const status = classifyBalance(balance, account.account_type, account.status);
      totals.total += 1;
      if (status.label === "CURRENT") totals.current += 1;
      if (status.label === "CREDIT") totals.credit += 1;
      if (status.label === "PAST DUE") totals.pastDue += 1;
      if (status.label === "CRITICAL") totals.critical += 1;

      const row = {
        id: account.account_id,
        accountNumber: account.account_number,
        name: account.customers?.full_name || "—",
        address: account.service_addresses?.street || "—",
        status: status.label,
        tone: status.tone,
        balance,
        type: account.account_type || "—",
        email: account.customers?.email || "—",
        phone: account.customers?.phone_primary || "—",
        lastPaymentDate: balanceMap[account.account_id]?.last_payment_date,
        lastPaymentAmount: balanceMap[account.account_id]?.last_payment_amount,
      };
      rows.push(row);

      if (account.service_addresses?.latitude && account.service_addresses?.longitude) {
        points.push({
          latitude: Number(account.service_addresses.latitude),
          longitude: Number(account.service_addresses.longitude),
          statusLabel: status.label,
          dot:
            status.label === "CRITICAL"
              ? "#cf6657"
              : status.label === "CURRENT"
                ? "#3c9c74"
                : status.label === "CREDIT"
                  ? "#5a9bd8"
                  : "#c8912f",
        });
      }
    });

    rows.sort((a, b) => b.balance - a.balance);

    return {
      mode: "system",
      system,
      totals,
      registerRows: rows,
      criticalRows: rows.filter((row) => row.status === "CRITICAL").slice(0, 10),
      points,
      calls: calls || [],
      compliance: compliance || [],
      latestCycle: cycles?.[0] || null,
    };
  }, [token, selectedCode, systems]);
}

function CommandPage({ token, staff, onSignOut }) {
  const { systems } = useSystems(token);
  const [selectedCode, setSelectedCode] = useState("ALL");
  const [mapFilter, setMapFilter] = useState("all");
  const [selectedRow, setSelectedRow] = useState(null);
  const state = useCommandData(token, selectedCode, systems);

  const options = [
    { value: "ALL", label: "ALL SYSTEMS — RADEUS NETWORK" },
    ...systems.map((system) => ({ value: system.system_code, label: `${system.system_code} — ${system.system_name}` })),
  ];

  const data = state.data;
  const latestCycle = data?.latestCycle;
  const collectionRate = data?.totals?.total
    ? Math.round((data.totals.current / data.totals.total) * 100)
    : 0;

  const tickerItems = data?.mode === "system"
    ? [
        `${data.system.system_name.toUpperCase()} ONLINE`,
        `CRITICAL ACCOUNTS — ${formatCount(data.totals.critical)}`,
        `COLLECTION RATE — ${collectionRate}%`,
        `DUE DATE — ${latestCycle?.due_date ? formatDate(latestCycle.due_date) : "N/A"}`,
      ]
    : [
        "RADEUS NETWORK — ALL SYSTEMS ONLINE",
        `TOTAL PORTFOLIO — ${formatCount(data?.totals?.total || 0)} ACCOUNTS`,
        `CRITICAL EXPOSURE — ${formatCount(data?.totals?.critical || 0)}`,
        "BOIL WATER NOTICE ACTIVE — OAK HILL NWS",
      ];

  return (
    <DashboardLayout
      pageTitle="Command"
      subtitle="Live operations view translated from the original RADEUS control screen into the new municipal light-mode system."
      systems={options}
      selectedSystem={selectedCode}
      onSystemChange={(value) => {
        startTransition(() => {
          setSelectedCode(value);
          setSelectedRow(null);
        });
      }}
      tickerItems={tickerItems}
      staff={staff}
      onSignOut={onSignOut}
    >
      {state.loading ? (
        <PageLoader label="Loading command center..." />
      ) : state.error ? (
        <EmptyState title="Command data unavailable" body={state.error} />
      ) : (
        <div className="three-column-layout">
          <div className="column-stack">
            <Panel title={data.mode === "system" ? `${data.system.system_code} status` : "Network status"}>
              <div className="stat-list">
                <StatRow label="Total accounts" value={formatCount(data.totals.total)} tone="info" />
                <StatRow label="Current / paid" value={formatCount(data.totals.current)} tone="success" />
                <StatRow label="Credit balance" value={formatCount(data.totals.credit)} tone="info" />
                <StatRow label="Past due" value={formatCount(data.totals.pastDue)} tone="warning" />
                <StatRow label="Critical" value={formatCount(data.totals.critical)} tone="danger" />
                <StatRow label="Bill date" value={latestCycle?.statement_date ? formatDate(latestCycle.statement_date) : "—"} />
                <StatRow label="Due date" value={latestCycle?.due_date ? formatDate(latestCycle.due_date) : "—"} />
              </div>
              <div className="progress-block">
                <span>Collection rate estimate</span>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${collectionRate}%` }} />
                </div>
                <strong>{collectionRate}%</strong>
              </div>
            </Panel>

            <Panel title="Critical accounts">
              {data.mode === "system" && data.criticalRows.length ? (
                <div className="list-stack">
                  {data.criticalRows.map((row) => (
                    <button className="list-item interactive" key={row.id} onClick={() => setSelectedRow(row)}>
                      <div>
                        <strong>{row.accountNumber}</strong>
                        <span>{row.name}</span>
                        <span>{row.address}</span>
                      </div>
                      <div className="list-meta">
                        <StatusPill label={row.status} tone={row.tone} />
                        <strong>{formatCurrency(row.balance)}</strong>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState title="No critical accounts" body="Select a system to inspect account-level risk." />
              )}
            </Panel>
          </div>

          <div className="column-stack wide">
            <Panel
              title={data.mode === "system" ? `System map — ${data.system.system_name}` : "RADEUS network map"}
              actions={
                <div className="segmented-actions">
                  <button className={mapFilter === "all" ? "mini-button active" : "mini-button"} onClick={() => setMapFilter("all")}>All</button>
                  <button className={mapFilter === "critical" ? "mini-button active" : "mini-button"} onClick={() => setMapFilter("critical")}>Critical</button>
                  <button className={mapFilter === "current" ? "mini-button active" : "mini-button"} onClick={() => setMapFilter("current")}>Current</button>
                </div>
              }
            >
              <div className="map-panel-wrap">
                <OperationsMap
                  points={data.points || []}
                  fallbackCenter={data.mode === "system" ? SYSTEM_HQ[data.system.system_code] : [-99.5, 31.0]}
                  filter={mapFilter}
                />
                <div className="map-legend">
                  <LegendRow label="Current" tone="success" />
                  <LegendRow label="Past due" tone="warning" />
                  <LegendRow label="Critical" tone="danger" />
                  <LegendRow label="Credit" tone="info" />
                </div>
              </div>
            </Panel>

            <Panel title={data.mode === "system" ? "Account register" : "System directory"}>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{data.mode === "system" ? "Acct #" : "System"}</th>
                      <th>{data.mode === "system" ? "Customer" : "Name"}</th>
                      <th>{data.mode === "system" ? "Address" : "Accounts"}</th>
                      <th>Status</th>
                      <th className="align-right">{data.mode === "system" ? "Balance" : "Critical"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mode === "system"
                      ? data.registerRows.slice(0, 16).map((row) => (
                          <tr key={row.id} onClick={() => setSelectedRow(row)}>
                            <td>{row.accountNumber}</td>
                            <td>{row.name}</td>
                            <td>{row.address}</td>
                            <td><StatusPill label={row.status} tone={row.tone} /></td>
                            <td className="align-right">{formatCurrency(row.balance)}</td>
                          </tr>
                        ))
                      : data.systemRows.map((row) => (
                          <tr key={row.code} onClick={() => setSelectedCode(row.code)}>
                            <td>{row.code}</td>
                            <td>{row.name}</td>
                            <td>{formatCount(row.count)}</td>
                            <td><StatusPill label="ONLINE" tone="success" /></td>
                            <td className="align-right">{formatCount(row.critical)}</td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="column-stack">
            <Panel title="Command dial">
              <div className="dial-panel">
                <div className="dial-ring">
                  <strong>{data.mode === "system" ? `${collectionRate}%` : formatCount(systems.length)}</strong>
                  <span>{data.mode === "system" ? "Collection" : "Systems"}</span>
                </div>
                <div className="dial-grid">
                  <KpiMini label="Bill" value={data.mode === "system" ? `${collectionRate}%` : "—"} />
                  <KpiMini label="Accts" value={formatCount(data.totals.total)} />
                  <KpiMini label="Calls" value={formatCount(data.calls.length)} />
                  <KpiMini label="Comp" value={formatCount(data.compliance.length)} />
                  <KpiMini label="Alerts" value={formatCount(data.totals.critical)} />
                  <KpiMini label="Sys" value={formatCount(systems.length)} />
                </div>
              </div>
            </Panel>

            <Panel title="Call log">
              {data.calls.length ? (
                <div className="list-stack">
                  {data.calls.map((call, index) => (
                    <div className="list-item" key={call.id || index}>
                      <div>
                        <strong>{call.call_ref || call.category || "Communication log"}</strong>
                        <span>{call.caller_name || call.customer_name || "RADEUS contact"}</span>
                        <span>{(call.description || "").slice(0, 84) || "No description available."}</span>
                      </div>
                      <StatusPill label={(call.category || "NOTE").slice(0, 12)} tone="info" />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No recent calls" body="Communication events will appear here." />
              )}
            </Panel>

            <Panel title="Compliance">
              {data.compliance.length ? (
                <div className="list-stack">
                  {data.compliance.slice(0, 5).map((event, index) => (
                    <div className="list-item" key={event.event_id || index}>
                      <div>
                        <strong>{event.event_type || event.category || "Compliance event"}</strong>
                        <span>{event.category || "RADEUS system"}</span>
                        <span>Due {formatDate(event.due_date)}</span>
                      </div>
                      <StatusPill
                        label={event.status || "OPEN"}
                        tone={event.status === "OVERDUE" ? "danger" : "warning"}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No open events" body="Compliance summaries will appear here." />
              )}
            </Panel>
          </div>

          {selectedRow ? (
            <div className="modal-backdrop" onClick={() => setSelectedRow(null)}>
              <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                <header className="modal-header">
                  <div>
                    <span className="eyebrow">{selectedRow.accountNumber}</span>
                    <h2>{selectedRow.name}</h2>
                  </div>
                  <button className="ghost-button" onClick={() => setSelectedRow(null)}>Close</button>
                </header>
                <div className="panel-body detail-grid">
                  <DetailRow label="Service address" value={selectedRow.address} />
                  <DetailRow label="Account type" value={selectedRow.type || "—"} />
                  <DetailRow label="Status" value={selectedRow.status} />
                  <DetailRow label="Balance" value={formatCurrency(selectedRow.balance)} />
                  <DetailRow label="Last payment" value={formatDate(selectedRow.lastPaymentDate)} />
                  <DetailRow label="Payment amount" value={formatCurrency(selectedRow.lastPaymentAmount || 0)} />
                  <DetailRow label="Email" value={selectedRow.email} />
                  <DetailRow label="Phone" value={selectedRow.phone} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </DashboardLayout>
  );
}

function AccountsPage({ token, staff, onSignOut }) {
  const { systems } = useSystems(token);
  const [selectedSystemId, setSelectedSystemId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [selectedAccount, setSelectedAccount] = useState(null);

  useEffect(() => {
    if (!selectedSystemId && systems.length) setSelectedSystemId(systems[0].system_id);
  }, [selectedSystemId, systems]);

  const state = useAsyncData(async () => {
    const [accounts, balances] = await Promise.all([
      select(
        "accounts",
        `?system_id=eq.${selectedSystemId}&select=account_id,account_number,account_type,status,notes,customers(full_name,phone_primary,email,billing_address),service_addresses(street,city,state,zip),meters(meter_number)&limit=800`,
        token,
      ),
      select("account_balances", `?system_id=eq.${selectedSystemId}&select=*`, token),
    ]);

    const balanceMap = Object.fromEntries((balances || []).map((row) => [row.account_id, row]));
    const rows = (accounts || []).map((account) => {
      const balance = Number(balanceMap[account.account_id]?.current_balance || 0);
      const status = classifyBalance(balance, account.account_type, account.status);
      return {
        id: account.account_id,
        accountNumber: account.account_number,
        name: account.customers?.full_name || "—",
        address: account.service_addresses?.street || "—",
        city: account.service_addresses?.city || "",
        zip: account.service_addresses?.zip || "",
        meter: account.meters?.meter_number || "—",
        balance,
        status: status.label,
        tone: status.tone,
        accountType: account.account_type || "—",
        email: account.customers?.email || "—",
        phone: account.customers?.phone_primary || "—",
        billAddress: account.customers?.billing_address || "—",
        notes: account.notes || "—",
        lastPaymentDate: balanceMap[account.account_id]?.last_payment_date,
      };
    });

    return {
      rows,
      totals: {
        total: rows.length,
        current: rows.filter((row) => row.status === "CURRENT").length,
        pastDue: rows.filter((row) => row.status === "PAST DUE").length,
        critical: rows.filter((row) => row.status === "CRITICAL").length,
        credit: rows.filter((row) => row.status === "CREDIT").length,
      },
      outstanding: rows.reduce((sum, row) => sum + (row.balance > 0 ? row.balance : 0), 0),
    };
  }, [token, selectedSystemId]);

  const deferredSearch = useDeferredValue(search);
  const filteredRows = useMemo(() => {
    const rows = state.data?.rows || [];
    return rows.filter((row) => {
      if (filter !== "ALL" && row.status !== filter) return false;
      if (!deferredSearch) return true;
      const q = deferredSearch.toLowerCase();
      return (
        row.accountNumber.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.address.toLowerCase().includes(q)
      );
    });
  }, [deferredSearch, filter, state.data?.rows]);

  return (
    <DashboardLayout
      pageTitle="Accounts"
      subtitle="Customer service account management with the original Supabase account and balance connections preserved."
      systems={systems.map((system) => ({ value: system.system_id, label: system.system_name }))}
      selectedSystem={selectedSystemId}
      onSystemChange={setSelectedSystemId}
      tickerItems={[
        `TOTAL ACCOUNTS — ${formatCount(state.data?.totals?.total || 0)}`,
        `PAST DUE EXPOSURE — ${formatCurrency(state.data?.outstanding || 0)}`,
        `CRITICAL ACCOUNTS — ${formatCount(state.data?.totals?.critical || 0)}`,
      ]}
      staff={staff}
      onSignOut={onSignOut}
    >
      {!selectedSystemId || state.loading ? (
        <PageLoader label="Loading accounts..." />
      ) : (
        <>
          <MetricStrip
            items={[
              { label: "Total accounts", value: formatCount(state.data?.totals?.total || 0), tone: "info" },
              { label: "Current", value: formatCount(state.data?.totals?.current || 0), tone: "success" },
              { label: "Past due", value: formatCount(state.data?.totals?.pastDue || 0), tone: "warning" },
              { label: "Critical", value: formatCount(state.data?.totals?.critical || 0), tone: "danger" },
              { label: "Outstanding", value: formatCurrency(state.data?.outstanding || 0), tone: "warning" },
            ]}
          />

          <div className="two-column-layout">
            <Panel
              title="Accounts directory"
              className="wide-panel"
              actions={
                <div className="toolbar">
                  <input
                    className="search-input"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by name, account #, or address"
                  />
                  <select className="system-select compact" value={filter} onChange={(event) => setFilter(event.target.value)}>
                    <option value="ALL">All</option>
                    <option value="CURRENT">Current</option>
                    <option value="PAST DUE">Past due</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="CREDIT">Credit</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              }
            >
              <div className="table-scroll tall">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Acct #</th>
                      <th>Customer</th>
                      <th>Service address</th>
                      <th>Status</th>
                      <th>Last payment</th>
                      <th className="align-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.id} onClick={() => setSelectedAccount(row)}>
                        <td>{row.accountNumber}</td>
                        <td>{row.name}</td>
                        <td>{row.address}</td>
                        <td><StatusPill label={row.status} tone={row.tone} /></td>
                        <td>{formatDate(row.lastPaymentDate)}</td>
                        <td className="align-right">{formatCurrency(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredRows.length ? (
                  <EmptyState title="No matching accounts" body="Adjust the search term or status filter to widen the results." />
                ) : null}
              </div>
            </Panel>

            <Panel title="Account profile">
              {selectedAccount ? (
                <div className="detail-grid">
                  <DetailRow label="Account number" value={selectedAccount.accountNumber} />
                  <DetailRow label="Customer" value={selectedAccount.name} />
                  <DetailRow label="Service address" value={`${selectedAccount.address}, ${selectedAccount.city} ${selectedAccount.zip}`} />
                  <DetailRow label="Meter" value={selectedAccount.meter} />
                  <DetailRow label="Status" value={selectedAccount.status} />
                  <DetailRow label="Account type" value={selectedAccount.accountType} />
                  <DetailRow label="Balance" value={formatCurrency(selectedAccount.balance)} />
                  <DetailRow label="Email" value={selectedAccount.email} />
                  <DetailRow label="Phone" value={selectedAccount.phone} />
                  <DetailRow label="Billing address" value={selectedAccount.billAddress} />
                  <DetailRow label="Notes" value={selectedAccount.notes} />
                </div>
              ) : (
                <EmptyState title="Select an account" body="Click a row to inspect account details." />
              )}
            </Panel>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

function GenericTablePage({
  token,
  staff,
  onSignOut,
  pageTitle,
  subtitle,
  table,
  queryBuilder,
  systems,
  selectedSystemId,
  setSelectedSystemId,
  columns,
  tickerItems,
  transform = (rows) => rows,
}) {
  const state = useAsyncData(
    async () => {
      const rows = await select(table, queryBuilder(selectedSystemId), token).catch(() => []);
      return transform(rows || []);
    },
    [token, selectedSystemId],
  );

  return (
    <DashboardLayout
      pageTitle={pageTitle}
      subtitle={subtitle}
      systems={systems.map((system) => ({ value: system.system_id, label: system.system_name }))}
      selectedSystem={selectedSystemId}
      onSystemChange={setSelectedSystemId}
      tickerItems={tickerItems(state.data)}
      staff={staff}
      onSignOut={onSignOut}
    >
      {!selectedSystemId || state.loading ? (
        <PageLoader label={`Loading ${pageTitle.toLowerCase()}...`} />
      ) : (
        <Panel title={`${pageTitle} register`}>
          <div className="table-scroll tall">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className={column.alignRight ? "align-right" : ""}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(state.data || []).map((row, index) => (
                  <tr key={row.id || row.payment_id || row.wo_id || row.event_id || index}>
                    {columns.map((column) => (
                      <td key={column.key} className={column.alignRight ? "align-right" : ""}>
                        {column.render ? column.render(row) : row[column.key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </DashboardLayout>
  );
}

function BillingPage({ token, staff, onSignOut }) {
  const { systems } = useSystems(token);
  const [selectedSystemId, setSelectedSystemId] = useState("");
  useEffect(() => {
    if (!selectedSystemId && systems.length) setSelectedSystemId(systems[0].system_id);
  }, [selectedSystemId, systems]);

  return (
    <GenericTablePage
      token={token}
      staff={staff}
      onSignOut={onSignOut}
      pageTitle="Billing"
      subtitle="Billing cycle visibility using the original RADEUS billing tables."
      table="billing_cycles"
      queryBuilder={(systemId) => `?system_id=eq.${systemId}&order=cycle_year.desc,cycle_month.desc&limit=60`}
      systems={systems}
      selectedSystemId={selectedSystemId}
      setSelectedSystemId={setSelectedSystemId}
      tickerItems={(rows) => [
        `BILLING CYCLES — ${formatCount(rows?.length || 0)}`,
        `LATEST STATEMENT — ${rows?.[0]?.statement_date ? formatDate(rows[0].statement_date) : "N/A"}`,
      ]}
      columns={[
        { key: "cycle_year", label: "Year" },
        { key: "cycle_month", label: "Month" },
        { key: "statement_date", label: "Statement date", render: (row) => formatDate(row.statement_date) },
        { key: "due_date", label: "Due date", render: (row) => formatDate(row.due_date) },
        { key: "status", label: "Status", render: (row) => <StatusPill label={row.status || "OPEN"} tone={row.status === "CLOSED" ? "muted" : "success"} /> },
      ]}
    />
  );
}

function ReadingsPage({ token, staff, onSignOut }) {
  const { systems } = useSystems(token);
  const [selectedSystemId, setSelectedSystemId] = useState("");
  useEffect(() => {
    if (!selectedSystemId && systems.length) setSelectedSystemId(systems[0].system_id);
  }, [selectedSystemId, systems]);

  return (
    <GenericTablePage
      token={token}
      staff={staff}
      onSignOut={onSignOut}
      pageTitle="Readings"
      subtitle="Recent meter reads and usage checks from the existing RADEUS reading tables."
      table="meter_reads"
      queryBuilder={(systemId) => `?system_id=eq.${systemId}&order=read_date.desc&limit=160`}
      systems={systems}
      selectedSystemId={selectedSystemId}
      setSelectedSystemId={setSelectedSystemId}
      tickerItems={(rows) => [
        `METER READS — ${formatCount(rows?.length || 0)}`,
        `HIGH USAGE FLAGS — ${formatCount((rows || []).filter((row) => Number(row.usage_gallons || row.consumption || 0) > 20000).length)}`,
      ]}
      columns={[
        { key: "read_date", label: "Read date", render: (row) => formatDate(row.read_date) },
        { key: "meter_id", label: "Meter" },
        { key: "reading_value", label: "Reading", render: (row) => formatCount(row.reading_value || row.current_read || 0) },
        { key: "usage_gallons", label: "Usage", render: (row) => formatCount(row.usage_gallons || row.consumption || 0) },
      ]}
    />
  );
}

function CompliancePage({ token, staff, onSignOut }) {
  const { systems } = useSystems(token);
  const [selectedSystemId, setSelectedSystemId] = useState("");
  useEffect(() => {
    if (!selectedSystemId && systems.length) setSelectedSystemId(systems[0].system_id);
  }, [selectedSystemId, systems]);

  return (
    <GenericTablePage
      token={token}
      staff={staff}
      onSignOut={onSignOut}
      pageTitle="Compliance"
      subtitle="Regulatory event tracking with live Supabase compliance data."
      table="compliance_events"
      queryBuilder={(systemId) => `?system_id=eq.${systemId}&order=due_date.asc&limit=160`}
      systems={systems}
      selectedSystemId={selectedSystemId}
      setSelectedSystemId={setSelectedSystemId}
      tickerItems={(rows) => [
        `OPEN EVENTS — ${formatCount((rows || []).filter((row) => row.status !== "RESOLVED").length)}`,
        `OVERDUE — ${formatCount((rows || []).filter((row) => row.status === "OVERDUE").length)}`,
      ]}
      columns={[
        { key: "category", label: "Category" },
        { key: "event_type", label: "Event" },
        { key: "due_date", label: "Due date", render: (row) => formatDate(row.due_date) },
        { key: "priority", label: "Priority" },
        {
          key: "status",
          label: "Status",
          render: (row) => (
            <StatusPill
              label={row.status || "OPEN"}
              tone={row.status === "OVERDUE" ? "danger" : row.status === "RESOLVED" ? "success" : "warning"}
            />
          ),
        },
      ]}
    />
  );
}

function PaymentsPage({ token, staff, onSignOut }) {
  const { systems } = useSystems(token);
  const [selectedSystemId, setSelectedSystemId] = useState("");
  useEffect(() => {
    if (!selectedSystemId && systems.length) setSelectedSystemId(systems[0].system_id);
  }, [selectedSystemId, systems]);

  return (
    <GenericTablePage
      token={token}
      staff={staff}
      onSignOut={onSignOut}
      pageTitle="Payments"
      subtitle="Payment history connected to the original RADEUS payment ledger."
      table="payments"
      queryBuilder={(systemId) => `?system_id=eq.${systemId}&order=payment_date.desc&limit=200`}
      systems={systems}
      selectedSystemId={selectedSystemId}
      setSelectedSystemId={setSelectedSystemId}
      tickerItems={(rows) => [
        `TRANSACTIONS — ${formatCount(rows?.length || 0)}`,
        `VISIBLE TOTAL — ${formatCurrency((rows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0))}`,
      ]}
      columns={[
        { key: "payment_date", label: "Date", render: (row) => formatDate(row.payment_date) },
        { key: "method", label: "Method" },
        { key: "reference_number", label: "Reference" },
        { key: "amount", label: "Amount", alignRight: true, render: (row) => formatCurrency(row.amount) },
      ]}
    />
  );
}

function WorkOrdersPage({ token, staff, onSignOut }) {
  const { systems } = useSystems(token);
  const [selectedSystemId, setSelectedSystemId] = useState("");
  useEffect(() => {
    if (!selectedSystemId && systems.length) setSelectedSystemId(systems[0].system_id);
  }, [selectedSystemId, systems]);

  return (
    <GenericTablePage
      token={token}
      staff={staff}
      onSignOut={onSignOut}
      pageTitle="Work Orders"
      subtitle="Maintenance queue and field operations visibility from the existing RADEUS work order table."
      table="work_orders"
      queryBuilder={(systemId) => `?system_id=eq.${systemId}&order=created_at.desc&limit=200`}
      systems={systems}
      selectedSystemId={selectedSystemId}
      setSelectedSystemId={setSelectedSystemId}
      tickerItems={(rows) => [
        `OPEN WORK ORDERS — ${formatCount((rows || []).filter((row) => !["COMPLETED", "CANCELLED"].includes(row.status)).length)}`,
        `CRITICAL PRIORITY — ${formatCount((rows || []).filter((row) => row.priority === "CRITICAL").length)}`,
      ]}
      columns={[
        { key: "wo_number", label: "WO #" },
        { key: "title", label: "Title" },
        { key: "category", label: "Category" },
        {
          key: "priority",
          label: "Priority",
          render: (row) => (
            <StatusPill
              label={row.priority || "NORMAL"}
              tone={row.priority === "CRITICAL" ? "danger" : row.priority === "HIGH" ? "warning" : "info"}
            />
          ),
        },
        { key: "status", label: "Status" },
      ]}
    />
  );
}

function ReportsPage({ token, staff, onSignOut }) {
  const { systems } = useSystems(token);
  const [selectedSystemId, setSelectedSystemId] = useState("");

  const state = useAsyncData(async () => {
    const systemFilter = selectedSystemId ? `&system_id=eq.${selectedSystemId}` : "";
    const [accounts, workOrders, compliance, payments] = await Promise.all([
      select("accounts", `?select=account_id,status&limit=600${systemFilter}`, token).catch(() => []),
      select("work_orders", `?select=wo_id,status,priority&limit=250${systemFilter}`, token).catch(() => []),
      select("compliance_events", "?select=event_id,status,due_date&limit=200", token).catch(() => []),
      select("payments", `?select=payment_date,amount&limit=1000${systemFilter}`, token).catch(() => []),
    ]);

    const monthly = {};
    (payments || []).forEach((payment) => {
      const month = (payment.payment_date || "").slice(0, 7);
      if (!month) return;
      if (!monthly[month]) monthly[month] = 0;
      monthly[month] += Number(payment.amount || 0);
    });

    return {
      accounts: accounts || [],
      workOrders: workOrders || [],
      compliance: compliance || [],
      payments: payments || [],
      monthly: Object.entries(monthly)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6)
        .map(([month, total]) => ({ month, total })),
    };
  }, [token, selectedSystemId]);

  const maxBar = Math.max(...(state.data?.monthly || []).map((row) => row.total), 1);

  return (
    <DashboardLayout
      pageTitle="Reports"
      subtitle="Report center and analytics built around the original RADEUS reports screen structure."
      systems={[{ value: "", label: "All systems" }].concat(
        systems.map((system) => ({ value: system.system_id, label: system.system_name })),
      )}
      selectedSystem={selectedSystemId}
      onSystemChange={setSelectedSystemId}
      tickerItems={[
        `COMPLIANCE OVERDUE — ${formatCount((state.data?.compliance || []).filter((row) => row.status === "OVERDUE").length)}`,
        `ACTIVE ACCOUNTS — ${formatCount((state.data?.accounts || []).filter((row) => row.status === "ACTIVE").length)}`,
        `OPEN WORK ORDERS — ${formatCount((state.data?.workOrders || []).filter((row) => row.status !== "COMPLETED").length)}`,
      ]}
      staff={staff}
      onSignOut={onSignOut}
    >
      {state.loading ? (
        <PageLoader label="Loading reports..." />
      ) : (
        <>
          <MetricStrip
            items={[
              { label: "Payments", value: formatCount(state.data?.payments?.length || 0), tone: "info" },
              { label: "Active accounts", value: formatCount((state.data?.accounts || []).filter((row) => row.status === "ACTIVE").length), tone: "success" },
              { label: "Open WO's", value: formatCount((state.data?.workOrders || []).filter((row) => row.status !== "COMPLETED").length), tone: "warning" },
              { label: "Compliance issues", value: formatCount((state.data?.compliance || []).filter((row) => row.status === "OVERDUE").length), tone: "danger" },
            ]}
          />

          <Panel title="Report center">
            <div className="card-grid six-up">
              {[
                "Collection report",
                "Customer roster",
                "Compliance status",
                "Work orders",
                "Payment history",
                "Communication log",
              ].map((card) => (
                <div className="action-card" key={card}>
                  <strong>{card}</strong>
                  <span>View and print this report from the standardized React report center.</span>
                  <div className="action-row">
                    <button className="mini-button active">View</button>
                    <button className="mini-button">Print</button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="three-column-layout reports-grid">
            <Panel title="Portfolio summary">
              <div className="kpi-stack">
                <KpiMini label="Systems" value={formatCount(systems.length)} />
                <KpiMini label="Overdue" value={formatCount((state.data?.compliance || []).filter((row) => row.status === "OVERDUE").length)} />
                <KpiMini label="Critical WO" value={formatCount((state.data?.workOrders || []).filter((row) => row.priority === "CRITICAL").length)} />
              </div>
            </Panel>

            <Panel title="Monthly collection trend">
              <div className="bar-chart">
                {(state.data?.monthly || []).map((row) => (
                  <div className="bar-column" key={row.month}>
                    <span>{formatCurrency(row.total)}</span>
                    <div className="bar-value" style={{ height: `${Math.max(16, (row.total / maxBar) * 160)}px` }} />
                    <small>{row.month.slice(5)}</small>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Compliance status">
              <div className="kpi-stack">
                <KpiMini label="Open" value={formatCount((state.data?.compliance || []).filter((row) => row.status !== "RESOLVED").length)} />
                <KpiMini label="Resolved" value={formatCount((state.data?.compliance || []).filter((row) => row.status === "RESOLVED").length)} />
              </div>
            </Panel>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

function CommsPage({ token, staff, onSignOut }) {
  const { systems } = useSystems(token);
  const [selectedSystemId, setSelectedSystemId] = useState("");
  useEffect(() => {
    if (!selectedSystemId && systems.length) setSelectedSystemId(systems[0].system_id);
  }, [selectedSystemId, systems]);

  return (
    <GenericTablePage
      token={token}
      staff={staff}
      onSignOut={onSignOut}
      pageTitle="Communications"
      subtitle="Customer and agency communication history sourced from the original RADEUS communication log."
      table="communication_log"
      queryBuilder={(systemId) => `?system_id=eq.${systemId}&order=created_at.desc&limit=160`}
      systems={systems}
      selectedSystemId={selectedSystemId}
      setSelectedSystemId={setSelectedSystemId}
      tickerItems={(rows) => [`LOG ENTRIES — ${formatCount(rows?.length || 0)}`, "COMMUNICATION CENTER ONLINE"]}
      columns={[
        { key: "call_ref", label: "Reference" },
        { key: "log_date", label: "Date", render: (row) => formatDate(row.log_date || row.created_at) },
        { key: "customer_name", label: "Customer", render: (row) => row.customer_name || row.caller_name || "—" },
        { key: "category", label: "Category" },
        { key: "status", label: "Status" },
      ]}
    />
  );
}

function SystemPage({ token, staff, onSignOut }) {
  const { systems } = useSystems(token);
  const [selectedSystemId, setSelectedSystemId] = useState("");
  useEffect(() => {
    if (!selectedSystemId && systems.length) setSelectedSystemId(systems[0].system_id);
  }, [selectedSystemId, systems]);

  const state = useAsyncData(async () => {
    const [infrastructure, workOrders, addresses, compliance] = await Promise.all([
      select("infrastructure", `?system_id=eq.${selectedSystemId}&select=*&limit=200`, token).catch(() => []),
      select("work_orders", `?system_id=eq.${selectedSystemId}&select=*&limit=80`, token).catch(() => []),
      select("service_addresses", `?system_id=eq.${selectedSystemId}&select=*&limit=400`, token).catch(() => []),
      select("compliance_events", `?system_id=eq.${selectedSystemId}&select=*&limit=50`, token).catch(() => []),
    ]);

    const activeSystem = systems.find((system) => system.system_id === selectedSystemId);
    return {
      infrastructure: infrastructure || [],
      workOrders: workOrders || [],
      compliance: compliance || [],
      points: (addresses || [])
        .filter((row) => row.latitude && row.longitude)
        .map((row) => ({
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          dot: "#2f86b5",
          statusLabel: "CURRENT",
        })),
      fallbackCenter: activeSystem ? SYSTEM_HQ[activeSystem.system_code] : [-99.5, 31.0],
    };
  }, [token, selectedSystemId, systems]);

  return (
    <DashboardLayout
      pageTitle="System"
      subtitle="Infrastructure and geographic context for the selected utility system."
      systems={systems.map((system) => ({ value: system.system_id, label: system.system_name }))}
      selectedSystem={selectedSystemId}
      onSystemChange={setSelectedSystemId}
      tickerItems={[
        `INFRASTRUCTURE ASSETS — ${formatCount(state.data?.infrastructure?.length || 0)}`,
        `OPEN WORK ORDERS — ${formatCount((state.data?.workOrders || []).filter((row) => row.status !== "COMPLETED").length)}`,
      ]}
      staff={staff}
      onSignOut={onSignOut}
    >
      {!selectedSystemId || state.loading ? (
        <PageLoader label="Loading system overview..." />
      ) : (
        <div className="two-column-layout">
          <Panel title="Service map" className="wide-panel">
            <div className="map-panel-wrap large">
              <OperationsMap points={state.data?.points || []} fallbackCenter={state.data?.fallbackCenter} />
            </div>
          </Panel>
          <div className="column-stack">
            <Panel title="Infrastructure summary">
              <div className="kpi-stack">
                <KpiMini label="Assets" value={formatCount(state.data?.infrastructure?.length || 0)} />
                <KpiMini label="Open WO's" value={formatCount((state.data?.workOrders || []).filter((row) => row.status !== "COMPLETED").length)} />
                <KpiMini label="Compliance" value={formatCount(state.data?.compliance?.length || 0)} />
              </div>
            </Panel>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function PortalPage() {
  const session = getPortalSession();
  const customer = getStoredCustomer();

  if (!session || !customer) return <Navigate to="/login" replace />;

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="wordmark large">RADEUS</div>
        <span className="eyebrow">Customer portal</span>
        <h1>{customer.full_name || "Customer"}</h1>
        <p>
          Customer authentication from the original app is preserved. This route is ready for the dedicated
          portal rebuild.
        </p>
      </div>
    </div>
  );
}

function LoginPage({ onSignedIn }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(SESSION_KEY) && localStorage.getItem(STAFF_KEY)) {
      navigate("/command", { replace: true });
    }
  }, [navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await signIn(email.trim(), password);
      onSignedIn();
      navigate(result.kind === "customer" ? "/portal" : "/command", { replace: true });
    } catch (submissionError) {
      setError(submissionError.message || "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="wordmark large">RADEUS</div>
        <span className="eyebrow">Water utility management platform</span>
        <h1>Operator access</h1>
        <p>Sign in with the existing Supabase-backed RADEUS credentials to open the React interface.</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>Email address</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="operator@waterdistrict.org"
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••••"
              required
            />
          </label>
          {error ? <div className="error-box">{error}</div> : null}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Authenticating..." : "Sign in to RADEUS"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ProtectedRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function RootRedirect({ session }) {
  return <Navigate to={session ? "/command" : "/login"} replace />;
}

export function App() {
  const auth = useAuthState();

  return (
    <Routes>
      <Route path="/" element={<RootRedirect session={auth.operatorSession} />} />
      <Route path="/login" element={<LoginPage onSignedIn={auth.refresh} />} />
      <Route path="/portal" element={<PortalPage />} />

      <Route path="/command" element={<ProtectedRoute session={auth.operatorSession}><CommandPage token={auth.operatorSession?.access_token} staff={auth.staff} onSignOut={auth.logout} /></ProtectedRoute>} />
      <Route path="/accounts" element={<ProtectedRoute session={auth.operatorSession}><AccountsPage token={auth.operatorSession?.access_token} staff={auth.staff} onSignOut={auth.logout} /></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute session={auth.operatorSession}><BillingPage token={auth.operatorSession?.access_token} staff={auth.staff} onSignOut={auth.logout} /></ProtectedRoute>} />
      <Route path="/readings" element={<ProtectedRoute session={auth.operatorSession}><ReadingsPage token={auth.operatorSession?.access_token} staff={auth.staff} onSignOut={auth.logout} /></ProtectedRoute>} />
      <Route path="/compliance" element={<ProtectedRoute session={auth.operatorSession}><CompliancePage token={auth.operatorSession?.access_token} staff={auth.staff} onSignOut={auth.logout} /></ProtectedRoute>} />
      <Route path="/payments" element={<ProtectedRoute session={auth.operatorSession}><PaymentsPage token={auth.operatorSession?.access_token} staff={auth.staff} onSignOut={auth.logout} /></ProtectedRoute>} />
      <Route path="/workorders" element={<ProtectedRoute session={auth.operatorSession}><WorkOrdersPage token={auth.operatorSession?.access_token} staff={auth.staff} onSignOut={auth.logout} /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute session={auth.operatorSession}><ReportsPage token={auth.operatorSession?.access_token} staff={auth.staff} onSignOut={auth.logout} /></ProtectedRoute>} />
      <Route path="/comms" element={<ProtectedRoute session={auth.operatorSession}><CommsPage token={auth.operatorSession?.access_token} staff={auth.staff} onSignOut={auth.logout} /></ProtectedRoute>} />
      <Route path="/system" element={<ProtectedRoute session={auth.operatorSession}><SystemPage token={auth.operatorSession?.access_token} staff={auth.staff} onSignOut={auth.logout} /></ProtectedRoute>} />
    </Routes>
  );
}
