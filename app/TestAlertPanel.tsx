"use client";

import { useState } from "react";
import TestAlert from "./TestAlert";

export default function TestAlertPanel() {
  const [open, setOpen] = useState(false);

  return (
    <section className="test-panel">
      <button
        type="button"
        className="test-toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span>Test alerts</span>
        <span className="test-toggle-icon">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="test-panel-content">
          <TestAlert />
        </div>
      )}
    </section>
  );
}
