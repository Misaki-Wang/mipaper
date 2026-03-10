const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export async function onRequestGet(context) {
  const {
    SUPABASE_URL = "",
    SUPABASE_PUBLISHABLE_KEY = "",
    SUPABASE_ANON_KEY = "",
    GITHUB_REDIRECT_TO = "",
    ALLOWED_EMAILS = "",
    ALLOWED_USER_IDS = "",
  } = context.env;

  return Response.json(
    {
      supabaseUrl: SUPABASE_URL,
      supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY,
      supabaseAnonKey: SUPABASE_ANON_KEY,
      githubRedirectTo: GITHUB_REDIRECT_TO,
      allowedEmails: splitCsv(ALLOWED_EMAILS),
      allowedUserIds: splitCsv(ALLOWED_USER_IDS),
    },
    {
      headers: JSON_HEADERS,
    }
  );
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
