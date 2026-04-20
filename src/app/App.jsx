import React from "react";
import {
  getOperatorSession,
  getPortalSession,
  getStoredCustomer,
  getStoredStaff,
  signIn,
  signOut,
} from "./auth.js";
import { MAPBOX_TOKEN, ORG_ID, SESSION_KEY, STAFF_KEY, SYSTEM_HQ } from "./config.js";
import { select } from "./supabase.js";

export function App() {
  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="wordmark">RADEUS</div>
        <div className="topbar-meta">
          <span className="operator-label">Connected</span>
        </div>
      </header>

      <main className="app-main">
        <section className="page-heading">
          <h1>Radeus Enterprise</h1>
          <p>
            The import paths are now corrected for a flat <code>src</code> folder.
          </p>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div className="panel-title">System Status</div>
          </div>
          <div className="panel-body">
            <div className="empty-state">
              <strong>App shell is loading.</strong>
              <span>
                Next step is confirming your original dashboard logic is still present in the
                GitHub version of App.jsx.
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}