import { openExclusiveDropdown, registerExclusiveDropdown } from "./nav_dropdowns.js?v=e61dc1f67f";

export function bindLibraryNav(root = document) {
  const shells = [...root.querySelectorAll("[data-library-nav]")];
  if (!shells.length) {
    return;
  }

  shells.forEach((shell) => {
    const toggle = shell.querySelector("[data-library-nav-toggle]");
    const menu = shell.querySelector("[data-library-nav-menu]");
    const label = shell.querySelector("[data-library-nav-toggle-label]");
    const links = [...shell.querySelectorAll("[data-library-nav-link]")];
    const defaultLabel = label?.textContent?.trim() || "Library";
    let open = false;
    const dropdown = {
      close: () => setOpen(false),
    };
    registerExclusiveDropdown(dropdown);

    const activeLink = links.find((link) => link.classList.contains("active") || link.getAttribute("aria-current") === "page");
    if (activeLink) {
      toggle?.classList.add("is-active");
    }
    if (label) {
      label.textContent = defaultLabel;
    }

    const setOpen = (nextOpen) => {
      open = nextOpen;
      if (!toggle || !menu) {
        return;
      }
      toggle.setAttribute("aria-expanded", String(open));
      menu.hidden = !open;
      shell.classList.toggle("is-open", open);
      if (open) {
        openExclusiveDropdown(dropdown);
      }
    };

    toggle?.addEventListener("click", (event) => {
      event.stopPropagation();
      setOpen(!open);
    });

    document.addEventListener("click", (event) => {
      if (!open) {
        return;
      }
      if (shell.contains(event.target)) {
        return;
      }
      setOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        toggle?.focus();
      }
    });

    links.forEach((link) => {
      link.addEventListener("click", () => {
        setOpen(false);
      });
    });

    setOpen(false);
  });
}
