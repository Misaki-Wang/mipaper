import { getAuthSnapshot, initLikesSync, signIn, signOut, subscribeAuth, syncLikesNow } from "./likes.js?v=99ec863b62";
import { openExclusiveDropdown, registerExclusiveDropdown } from "./nav_dropdowns.js?v=cd4da78ec3";
import { readToolbarAutoHidePreference, setToolbarAutoHidePreference, subscribeUserSettings } from "./user_settings.js?v=6c7496f04b";
import { escapeAttribute, escapeHtml, formatDateTime } from "./ui_utils.js?v=e2da3b3a11";
const AUTH_TIME_FORMAT = {
  locale: "en-US",
  emptyValue: "",
  fallbackToOriginal: true,
  formatOptions: {
    dateStyle: "medium",
    timeStyle: "short",
  },
};

export function bindBranchAuthToolbar(prefix) {
  const toolbar = document.querySelector(".app-toolbar");
  const shell = document.querySelector(`#${prefix}-account-menu-shell`);
  const button = document.querySelector(`#${prefix}-account-menu-toggle`);
  const panel = document.querySelector(`#${prefix}-sync-menu`);
  const avatar = document.querySelector(`#${prefix}-account-trigger-avatar`);
  const card = document.querySelector(`#${prefix}-account-card`);
  const warning = document.querySelector(`#${prefix}-auth-warning`);
  const status = document.querySelector(`#${prefix}-auth-status`);
  const authButton = document.querySelector(`#${prefix}-auth-button`);
  const syncNowButton = document.querySelector(`#${prefix}-sync-now`);
  const autoHideButton = document.querySelector(`#${prefix}-toolbar-autohide-toggle`);

  bindToolbarAutoHide(toolbar, autoHideButton);

  void initLikesSync().catch((error) => {
    console.warn("Failed to initialize auth sync state", error);
  });

  if (!shell || !button || !panel) {
    return;
  }

  const preferenceSection = shell.querySelector("[data-account-preferences-section]");
  const preferenceRows = [...shell.querySelectorAll("[data-account-preference-option]")];
  const autoHideModeButtons = [...shell.querySelectorAll("[data-toolbar-autohide-mode-toggle]")];
  const authActions = shell.querySelector(".auth-actions");
  const settingsRow = shell.querySelector(".account-settings-row");

  let open = false;
  let latestSnapshot = getAuthSnapshot();
  const dropdown = {
    close: () => setOpen(false),
  };
  registerExclusiveDropdown(dropdown);

  const setOpen = (nextOpen) => {
    open = nextOpen;
    button.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
    if (open) {
      openExclusiveDropdown(dropdown);
    }
  };

  const render = (snapshot) => {
    latestSnapshot = snapshot;
    const identitySource = snapshot.unauthorized ? snapshot.blockedUser : snapshot.user;
    const signedIn = Boolean(snapshot.signedIn && snapshot.user && !snapshot.unauthorized);
    const hasSession = Boolean(snapshot.signedIn);
    const canShowAuthAction = Boolean(snapshot.configured);
    const canShowSyncNow = Boolean(snapshot.configured && signedIn && !snapshot.unauthorized);
    const hasVisibleAuthActions = canShowAuthAction || canShowSyncNow;
    const metadata = identitySource?.user_metadata || {};
    const displayName =
      identitySource?.displayName ||
      metadata.full_name ||
      metadata.name ||
      metadata.preferred_username ||
      metadata.user_name ||
      "Not signed in";
    const email = identitySource?.email || identitySource?.id || identitySource?.userId || "OAuth + Supabase";
    const avatarUrl = identitySource?.avatarUrl || metadata.avatar_url || "";
    const initial = String(displayName || email || "?").trim().charAt(0).toUpperCase() || "?";

    const buttonLabel = snapshot.unauthorized
      ? `Unauthorized: ${displayName}`
      : signedIn
        ? `Connected: ${displayName}`
        : "Sync account";
    button.title = snapshot.unauthorized ? `Unauthorized: ${email}` : signedIn ? `${displayName} · ${email}` : "Sign in to sync";
    button.setAttribute("aria-label", buttonLabel);
    button.classList.toggle("is-signed-in", Boolean(snapshot.signedIn && !snapshot.unauthorized));
    button.classList.toggle("is-syncing", Boolean(snapshot.syncing));
    button.classList.toggle("is-disabled", !snapshot.configured);
    button.classList.toggle("is-unauthorized", Boolean(snapshot.unauthorized));

    if (avatar) {
      if ((signedIn || snapshot.unauthorized) && avatarUrl) {
        avatar.innerHTML = `<img class="account-avatar-image" src="${escapeAttribute(avatarUrl)}" alt="${escapeAttribute(displayName)}" />`;
      } else {
        avatar.innerHTML = `<span class="account-avatar-fallback">${escapeHtml(initial)}</span>`;
      }
    }

    if (card) {
      card.classList.toggle("is-empty", !signedIn && !snapshot.unauthorized);
      card.classList.toggle("is-unauthorized", Boolean(snapshot.unauthorized));
      const avatarShell = card.querySelector(".account-avatar-shell");
      const nameNode = card.querySelector(".account-card-name");
      const emailNode = card.querySelector(".account-card-email");
      if (nameNode) {
        nameNode.textContent = snapshot.unauthorized ? `Unauthorized · ${displayName}` : signedIn ? displayName : "Not signed in";
      }
      if (emailNode) {
        emailNode.textContent = snapshot.unauthorized ? email : signedIn ? email : "OAuth + Supabase";
      }
      if (avatarShell) {
        if (signedIn && avatarUrl) {
          avatarShell.innerHTML = `<img class="account-avatar-image" src="${escapeAttribute(avatarUrl)}" alt="${escapeAttribute(displayName)}" />`;
        } else {
          avatarShell.innerHTML = `<div class="account-avatar-fallback">${escapeHtml(initial)}</div>`;
        }
      }
    }

    if (warning) {
      if (!snapshot.unauthorized) {
        warning.hidden = true;
        warning.textContent = "";
      } else {
        warning.hidden = false;
        warning.textContent = snapshot.unauthorizedMessage || "The current account is not on the allowlist. Like access is restricted.";
      }
    }

    if (status) {
      if (!snapshot.configured) {
        status.textContent = "Sync unavailable. Missing Supabase config.";
      } else if (snapshot.unauthorized) {
        status.textContent = snapshot.unauthorizedMessage || "This account is not authorized.";
      } else if (snapshot.signedIn) {
        if (snapshot.syncing) {
          status.textContent = "Syncing now.";
        } else if (snapshot.syncError) {
          status.textContent = `Sync failed: ${snapshot.syncError}`;
        } else if (snapshot.lastSyncedAt) {
          status.textContent = `Synced ${formatDateTime(snapshot.lastSyncedAt, AUTH_TIME_FORMAT)}`;
        } else {
          status.textContent = "Auto sync ready.";
        }
      } else {
        status.textContent = "Sign in to sync across devices.";
      }
    }

    if (authActions) {
      const visibleActionCount = [canShowAuthAction, canShowSyncNow].filter(Boolean).length;
      authActions.dataset.visibleCount = String(visibleActionCount);
      authActions.hidden = !hasVisibleAuthActions;
    }
    if (settingsRow) {
      settingsRow.classList.toggle("is-standalone", !hasVisibleAuthActions);
    }
    if (authButton) {
      authButton.hidden = !canShowAuthAction;
      authButton.disabled = !canShowAuthAction;
      authButton.textContent = hasSession ? "Sign out" : "Sign in";
    }
    if (syncNowButton) {
      syncNowButton.hidden = !canShowSyncNow;
      syncNowButton.disabled = !canShowSyncNow || snapshot.syncing;
      syncNowButton.textContent = snapshot.syncing ? "Syncing..." : "Sync now";
    }
  };

  button.addEventListener("click", (event) => {
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
    }
  });

  panel.addEventListener("click", (event) => {
    const autoHideModeButton =
      event.target instanceof Element ? event.target.closest("[data-toolbar-autohide-mode-toggle]") : null;
    if (!autoHideModeButton) {
      return;
    }
    setToolbarAutoHidePreference((autoHideModeButton.dataset.toolbarAutohideModeToggle || "enabled") === "enabled");
  });

  if (authButton) {
    authButton.addEventListener("click", async () => {
      if (latestSnapshot.signedIn) {
        await signOut();
        return;
      }
      if (status) {
        status.textContent = "Redirecting to sign-in. Sync will resume automatically when you return.";
      }
      await signIn();
    });
  }

  if (syncNowButton) {
    syncNowButton.addEventListener("click", async () => {
      try {
        syncNowButton.disabled = true;
        await syncLikesNow();
      } catch (error) {
        if (status) {
          status.textContent = `Sync failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      } finally {
        syncNowButton.disabled = false;
        render(getAuthSnapshot());
      }
    });
  }

  subscribeAuth(render);
  subscribeUserSettings((snapshot) => {
    syncPreferencePanel(snapshot);
  });
  setOpen(false);
  render(getAuthSnapshot());

  function syncPreferencePanel(snapshot) {
    const pinned = new Set(Array.isArray(snapshot?.accountPanelPreferencePins) ? snapshot.accountPanelPreferencePins : []);
    let visibleCount = 0;

    preferenceRows.forEach((row) => {
      const key = String(row.dataset.accountPreferenceOption || "").trim().toLowerCase();
      const visible = pinned.has(key);
      row.hidden = !visible;
      if (visible) {
        visibleCount += 1;
      }
    });

    if (preferenceSection) {
      preferenceSection.hidden = visibleCount === 0;
    }

    autoHideModeButtons.forEach((button) => {
      const value = button.dataset.toolbarAutohideModeToggle || "enabled";
      const active = snapshot?.toolbarAutoHide ? value === "enabled" : value === "disabled";
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
}

export function bindToolbarAutoHide(toolbar, toggleButton) {
  if (!toolbar || toolbar.dataset.autoHideBound === "true") {
    return;
  }
  toolbar.dataset.autoHideBound = "true";

  const mobileToolbarQuery =
    typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 760px)") : null;
  const isMobileViewport = () => Boolean(mobileToolbarQuery?.matches);

  let preferredAutoHideEnabled = readToolbarAutoHidePreference();
  let autoHideEnabled = preferredAutoHideEnabled && !isMobileViewport();
  let lastY = window.scrollY;
  let collapse = 0;
  let targetCollapse = 0;
  let rafId = 0;

  const hideDistance = 144;
  const syncToolbarHiddenState = (hidden) => {
    document.querySelectorAll(".app-toolbar").forEach((node) => {
      node.hidden = hidden;
      node.setAttribute("aria-hidden", hidden ? "true" : "false");
    });
  };

  const setCollapse = (value) => {
    collapse = Math.max(0, Math.min(1, value));
    const eased = collapse * collapse * (3 - 2 * collapse);
    const offset = -hideDistance * eased;
    const opacity = 1 - collapse * 0.08;
    const fullyCollapsed = collapse > 0.94;
    syncToolbarHiddenState(fullyCollapsed);
    toolbar.style.transform = `translateY(${offset}px)`;
    toolbar.style.opacity = opacity.toFixed(4);
    toolbar.classList.toggle("is-collapsed", fullyCollapsed);
  };

  const syncToggleButton = () => {
    if (!toggleButton) {
      return;
    }
    const hiddenOnMobile = isMobileViewport();
    toggleButton.hidden = hiddenOnMobile;
    toggleButton.classList.toggle("is-enabled", autoHideEnabled);
    toggleButton.setAttribute("aria-hidden", String(hiddenOnMobile));
    toggleButton.setAttribute("aria-pressed", String(autoHideEnabled));
    toggleButton.setAttribute(
      "aria-label",
      autoHideEnabled ? "Disable auto-hide toolbar" : "Enable auto-hide toolbar",
    );
    toggleButton.title = autoHideEnabled ? "Disable auto-hide toolbar" : "Enable auto-hide toolbar";
  };

  const setTargetCollapse = (value) => {
    targetCollapse = Math.max(0, Math.min(1, value));
    scheduleTick();
  };

  const setAutoHideEnabled = (enabled, options = {}) => {
    const { persist = true } = options;
    preferredAutoHideEnabled = Boolean(enabled);
    if (persist) {
      setToolbarAutoHidePreference(preferredAutoHideEnabled);
    }
    autoHideEnabled = preferredAutoHideEnabled && !isMobileViewport();
    syncToggleButton();
    if (!autoHideEnabled) {
      targetCollapse = 0;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      setCollapse(0);
      lastY = Math.max(0, window.scrollY || 0);
      return;
    }
    lastY = Math.max(0, window.scrollY || 0);
    onScroll();
  };

  const tick = () => {
    rafId = 0;
    const nextCollapse = collapse + (targetCollapse - collapse) * 0.2;
    if (Math.abs(targetCollapse - nextCollapse) < 0.001) {
      setCollapse(targetCollapse);
      return;
    }
    setCollapse(nextCollapse);
    scheduleTick();
  };

  const scheduleTick = () => {
    if (!rafId) {
      rafId = window.requestAnimationFrame(tick);
    }
  };

  const onScroll = () => {
    const currentY = Math.max(0, window.scrollY || 0);
    const delta = currentY - lastY;

    if (!autoHideEnabled) {
      lastY = currentY;
      return;
    }

    if (currentY <= 12) {
      setTargetCollapse(0);
    } else if (delta >= 3) {
      setTargetCollapse(1);
    } else if (delta <= -3) {
      setTargetCollapse(0);
    }

    lastY = currentY;
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    if (autoHideEnabled) {
      onScroll();
    } else {
      setCollapse(0);
    }
  }, { passive: true });
  if (mobileToolbarQuery) {
    const handleViewportChange = () => {
      setAutoHideEnabled(preferredAutoHideEnabled, { persist: false });
    };
    if (typeof mobileToolbarQuery.addEventListener === "function") {
      mobileToolbarQuery.addEventListener("change", handleViewportChange);
    } else if (typeof mobileToolbarQuery.addListener === "function") {
      mobileToolbarQuery.addListener(handleViewportChange);
    }
  }
  if (toggleButton) {
    toggleButton.addEventListener("click", (event) => {
      event.stopPropagation();
      setAutoHideEnabled(!preferredAutoHideEnabled);
    });
  }
  subscribeUserSettings((snapshot) => {
    if (snapshot.toolbarAutoHide === preferredAutoHideEnabled) {
      return;
    }
    setAutoHideEnabled(snapshot.toolbarAutoHide, { persist: false });
  });
  syncToggleButton();
  setCollapse(0);
  setTargetCollapse(0);
  if (!autoHideEnabled) {
    setCollapse(0);
  }
}
