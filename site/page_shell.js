import { openExclusiveDropdown, registerExclusiveDropdown } from "./nav_dropdowns.js?v=cd4da78ec3";

export function bindFilterMenu({ button, panel, labelNode = null, iconNode = null, labelText = "Filters", iconText = "☰" }) {
  if (!button || !panel) {
    return () => {};
  }

  let open = false;
  const dropdown = {
    close: () => setOpen(false),
  };
  registerExclusiveDropdown(dropdown);

  function setOpen(nextOpen) {
    open = nextOpen;
    button.setAttribute("aria-expanded", String(nextOpen));
    button.setAttribute("aria-label", nextOpen ? "Close filters" : "Open filters");
    button.title = nextOpen ? "Close filters" : "Open filters";
    if (labelNode) {
      labelNode.textContent = labelText;
    }
    if (iconNode) {
      iconNode.textContent = iconText;
    }
    panel.hidden = !nextOpen;
    if (nextOpen) {
      openExclusiveDropdown(dropdown);
    }
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!open);
  });

  document.addEventListener("click", (event) => {
    if (!open) {
      return;
    }
    if (panel.contains(event.target) || button.contains(event.target)) {
      return;
    }
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) {
      setOpen(false);
    }
  });

  setOpen(false);
  return setOpen;
}

export function bindBackToTop(button, { threshold = 720 } = {}) {
  if (!button) {
    return;
  }

  function updateVisibility() {
    const visible = window.scrollY > threshold;
    button.classList.toggle("is-visible", visible);
    button.setAttribute("aria-hidden", String(!visible));
  }

  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();
}
