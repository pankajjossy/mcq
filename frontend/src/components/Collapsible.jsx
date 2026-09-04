import { useState, useEffect } from "react";

// forceOpen: when true the body is always shown (e.g. when parent opens an
// inline editor via pencil icon without the teacher having clicked the header).
export default function Collapsible({ head, meta, defaultOpen = false, done = false, forceOpen = false, onOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = open || forceOpen;

  // If a parent forces us open, stay open even after forceOpen goes back false.
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  function handleToggle() {
    if (!isOpen && onOpen) onOpen();
    setOpen(!isOpen);
  }

  return (
    <div className={`collapsible ${done ? "done" : ""}`}>
      <div className="collapsible-head" onClick={handleToggle}>
        <div>
          <div className="subject">{head}</div>
          {meta && <div className="meta">{meta}</div>}
        </div>
        <span className={`collapsible-chevron ${isOpen ? "open" : ""}`}>▶</span>
      </div>
      {isOpen && <div className="collapsible-body">{children}</div>}
    </div>
  );
}
