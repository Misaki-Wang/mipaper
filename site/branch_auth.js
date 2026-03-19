import { getAuthSnapshot, signInWithGitHub, signOutFromGitHub, subscribeAuth, syncLikesNow } from "./likes.js?v=20260319-4";

const TOOLBAR_AUTO_HIDE_KEY = "cool-paper-toolbar-auto-hide";

export function bindBranchAuthToolbar(prefix) {
  const toolbar = document.querySelector(".app-toolbar");
  const shell = document.querySelector(`#${prefix}-account-menu-shell`);
  const button = document.querySelector(`#${prefix}-account-menu-toggle`);
  const panel = document.querySelector(`#${prefix}-sync-menu`);
  const avatar = document.querySelector(`#${prefix}-account-trigger-avatar`);
  const card = document.querySelector(`#${prefix}-account-card`);
  const warning = document.querySelector(`#${prefix}-auth-warning`);
  const status = document.querySelector(`#${prefix}-auth-status`);
  const signInButton = document.querySelector(`#${prefix}-sign-in`);
  const signOutButton = document.querySelector(`#${prefix}-sign-out`);
  const syncNowButton = document.querySelector(`#${prefix}-sync-now`);
  const autoHideButton = document.querySelector(`#${prefix}-toolbar-autohide-toggle`);

  bindToolbarAutoHide(toolbar, autoHideButton);

  if (!shell || !button || !panel) {
    return;
  }

  let open = false;

  const setOpen = (nextOpen) => {
    open = nextOpen;
    button.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
  };

  const render = (snapshot) => {
    const identitySource = snapshot.unauthorized ? snapshot.blockedUser : snapshot.user;
    const signedIn = Boolean(snapshot.signedIn && snapshot.user && !snapshot.unauthorized);
    const metadata = identitySource?.user_metadata || {};
    const displayName =
      identitySource?.displayName ||
      metadata.full_name ||
      metadata.name ||
      metadata.preferred_username ||
      metadata.user_name ||
      "Not signed in";
    const email = identitySource?.email || identitySource?.id || identitySource?.userId || "GitHub + Supabase";
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
        emailNode.textContent = snapshot.unauthorized ? email : signedIn ? email : "GitHub + Supabase";
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
        status.textContent = "Sync disabled. Supabase is not configured.";
      } else if (snapshot.unauthorized) {
        status.textContent = snapshot.unauthorizedMessage || "This account is not authorized for sync.";
      } else if (snapshot.signedIn) {
        if (snapshot.syncing) {
          status.textContent = "Syncing likes to Supabase now.";
        } else if (snapshot.syncError) {
          status.textContent = `Sync failed: ${snapshot.syncError}`;
        } else if (snapshot.lastSyncedAt) {
          status.textContent = `Last synced ${formatTime(snapshot.lastSyncedAt)}`;
        } else {
          status.textContent = "Connected. Automatic sync is ready.";
        }
      } else {
        status.textContent = "Sign in with GitHub to sync likes across devices.";
      }
    }

    if (signInButton) {
      signInButton.disabled = !snapshot.configured || (snapshot.signedIn && !snapshot.unauthorized);
    }
    if (signOutButton) {
      signOutButton.disabled = !snapshot.configured || !snapshot.signedIn;
    }
    if (syncNowButton) {
      syncNowButton.disabled = !snapshot.configured || !snapshot.signedIn || snapshot.syncing || snapshot.unauthorized;
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

  if (signInButton) {
    signInButton.addEventListener("click", async () => {
      if (status) {
        status.textContent = "Redirecting to GitHub sign-in. Likes will sync automatically when you return.";
      }
      await signInWithGitHub();
    });
  }

  if (signOutButton) {
    signOutButton.addEventListener("click", async () => {
      await signOutFromGitHub();
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
  setOpen(false);
  render(getAuthSnapshot());
}

export function bindToolbarAutoHide(toolbar, toggleButton) {
  if (!toolbar || toolbar.dataset.autoHideBound === "true") {
    return;
  }
  toolbar.dataset.autoHideBound = "true";

  let autoHideEnabled = readToolbarAutoHidePreference();
  let lastY = window.scrollY;
  let collapse = 0;
  let targetCollapse = 0;
  let rafId = 0;

  const hideDistance = 144;

  const setCollapse = (value) => {
    collapse = Math.max(0, Math.min(1, value));
    const eased = collapse * collapse * (3 - 2 * collapse);
    const offset = -hideDistance * eased;
    const opacity = 1 - collapse * 0.08;
    toolbar.style.transform = `translateY(${offset}px)`;
    toolbar.style.opacity = opacity.toFixed(4);
    const fullyCollapsed = collapse > 0.94;
    toolbar.classList.toggle("is-collapsed", fullyCollapsed);
    toolbar.setAttribute("aria-hidden", fullyCollapsed ? "true" : "false");
  };

  const syncToggleButton = () => {
    if (!toggleButton) {
      return;
    }
    toggleButton.classList.toggle("is-enabled", autoHideEnabled);
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

  const setAutoHideEnabled = (enabled) => {
    autoHideEnabled = Boolean(enabled);
    window.localStorage.setItem(TOOLBAR_AUTO_HIDE_KEY, autoHideEnabled ? "1" : "0");
    syncToggleButton();
    if (!autoHideEnabled) {
      targetCollapse = 0;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      setCollapse(0);
      return;
    }
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
  if (toggleButton) {
    toggleButton.addEventListener("click", (event) => {
      event.stopPropagation();
      setAutoHideEnabled(!autoHideEnabled);
    });
  }
  syncToggleButton();
  setCollapse(0);
  setTargetCollapse(0);
  if (!autoHideEnabled) {
    setCollapse(0);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function readToolbarAutoHidePreference() {
  const stored = window.localStorage.getItem(TOOLBAR_AUTO_HIDE_KEY);
  if (stored === null) {
    return true;
  }
  return stored !== "0" && stored !== "false";
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return String(timestamp);
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
