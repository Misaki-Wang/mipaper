import { appConfig } from "./config.js";

let supabaseClientPromise = null;
let runtimeConfigPromise = null;
const runtimeConfig = normalizeRuntimeConfig(appConfig);

function resolvePublicKey(config) {
  return config.supabasePublishableKey || config.supabaseAnonKey || "";
}

function normalizeIdentityList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeRuntimeConfig(config) {
  return {
    ...config,
    allowedEmails: normalizeIdentityList(config.allowedEmails).map((item) => item.toLowerCase()),
    allowedUserIds: normalizeIdentityList(config.allowedUserIds),
  };
}

export async function loadRuntimeConfig() {
  if (runtimeConfigPromise) {
    return runtimeConfigPromise;
  }
  runtimeConfigPromise = fetchRuntimeConfig()
    .then((remoteConfig) => {
      Object.assign(runtimeConfig, normalizeRuntimeConfig(remoteConfig));
      return { ...runtimeConfig };
    })
    .catch((error) => {
      console.warn("Failed to load runtime config from /api/config, using local fallback.", error);
      return { ...runtimeConfig };
    });
  return runtimeConfigPromise;
}

export function isSupabaseConfigured() {
  return Boolean(runtimeConfig.supabaseUrl && resolvePublicKey(runtimeConfig));
}

export function getGitHubRedirectTo() {
  if (runtimeConfig.githubRedirectTo) {
    return runtimeConfig.githubRedirectTo;
  }
  return new URL("./like.html", window.location.href).href;
}

export function getAccessPolicy() {
  return {
    allowedEmails: [...runtimeConfig.allowedEmails],
    allowedUserIds: [...runtimeConfig.allowedUserIds],
  };
}

export function isAuthorizedUser(user) {
  if (!user) {
    return false;
  }
  const { allowedEmails, allowedUserIds } = getAccessPolicy();
  if (!allowedEmails.length && !allowedUserIds.length) {
    return true;
  }
  const email = String(user.email || "").trim().toLowerCase();
  return allowedUserIds.includes(user.id) || (email ? allowedEmails.includes(email) : false);
}

export async function getSupabaseClient() {
  await loadRuntimeConfig();
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) =>
      createClient(runtimeConfig.supabaseUrl, resolvePublicKey(runtimeConfig), {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    );
  }
  return supabaseClientPromise;
}

async function fetchRuntimeConfig() {
  if (typeof window === "undefined") {
    return {};
  }

  const url = new URL("./api/config", window.location.href);
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Config endpoint returned ${response.status}`);
  }

  const payload = await response.json();
  return {
    supabaseUrl: typeof payload.supabaseUrl === "string" ? payload.supabaseUrl : runtimeConfig.supabaseUrl,
    supabasePublishableKey:
      typeof payload.supabasePublishableKey === "string"
        ? payload.supabasePublishableKey
        : runtimeConfig.supabasePublishableKey,
    supabaseAnonKey:
      typeof payload.supabaseAnonKey === "string" ? payload.supabaseAnonKey : runtimeConfig.supabaseAnonKey,
    githubRedirectTo:
      typeof payload.githubRedirectTo === "string" ? payload.githubRedirectTo : runtimeConfig.githubRedirectTo,
    allowedEmails: payload.allowedEmails,
    allowedUserIds: payload.allowedUserIds,
  };
}
