import { useState } from "react";

export default function Collapsible({ head, meta, defaultOpen = false, done = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`collapsible ${done ? "done" : ""}`}>
      <div className="collapsible-head" onClick={() => setOpen(!open)}>
        <div>
          <div className="subject">{head}</div>
          {meta && <div className="meta">{meta}</div>}
        </div>
        <span className={`collapsible-chevron ${open ? "open" : ""}`}>▶</span>
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}
