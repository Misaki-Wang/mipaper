import { appConfig } from "./config.js";

let supabaseClientPromise = null;
let runtimeConfigPromise = null;
const runtimeConfig = { ...appConfig };

export async function loadRuntimeConfig() {
  if (runtimeConfigPromise) {
    return runtimeConfigPromise;
  }
  runtimeConfigPromise = fetchRuntimeConfig()
    .then((remoteConfig) => {
      Object.assign(runtimeConfig, remoteConfig);
      return { ...runtimeConfig };
    })
    .catch((error) => {
      console.warn("Failed to load runtime config from /api/config, using local fallback.", error);
      return { ...runtimeConfig };
    });
  return runtimeConfigPromise;
}

export function isSupabaseConfigured() {
  return Boolean(runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey);
}

export function getGitHubRedirectTo() {
  if (runtimeConfig.githubRedirectTo) {
    return runtimeConfig.githubRedirectTo;
  }
  return new URL("./like.html", window.location.href).href;
}

export async function getSupabaseClient() {
  await loadRuntimeConfig();
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) =>
      createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey, {
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
    supabaseAnonKey:
      typeof payload.supabaseAnonKey === "string" ? payload.supabaseAnonKey : runtimeConfig.supabaseAnonKey,
    githubRedirectTo:
      typeof payload.githubRedirectTo === "string" ? payload.githubRedirectTo : runtimeConfig.githubRedirectTo,
  };
}
