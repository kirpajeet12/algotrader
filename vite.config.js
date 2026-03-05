import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import https from "https";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function httpsGet(url, cookie) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": UA, "Accept": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    }, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => resolve({ data, headers: res.headers }));
    });
    req.on("error", reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

let cachedCrumb = null;
let cachedCookie = null;

async function getCrumb() {
  if (cachedCrumb && cachedCookie) return { crumb: cachedCrumb, cookie: cachedCookie };
  // Step 1: get a session cookie
  const { headers } = await httpsGet("https://fc.yahoo.com", null);
  const setCookie = headers["set-cookie"];
  if (!setCookie) throw new Error("No cookie from Yahoo");
  cachedCookie = setCookie.map(c => c.split(";")[0]).join("; ");
  // Step 2: get the crumb using the cookie
  const { data } = await httpsGet("https://query1.finance.yahoo.com/v1/test/getcrumb", cachedCookie);
  if (!data || data === "null") throw new Error("No crumb returned");
  cachedCrumb = data.trim();
  return { crumb: cachedCrumb, cookie: cachedCookie };
}

function yahooFinancePlugin() {
  return {
    name: "yahoo-finance-proxy",
    configureServer(server) {
      server.middlewares.use("/api/yahoo", async (req, res) => {
        try {
          const { crumb, cookie } = await getCrumb();
          const ticker = req.url.split("/v8/finance/chart/")[1]?.split("?")[0];
          if (!ticker) throw new Error("No ticker in URL");
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=6mo&interval=1d&includePrePost=false&crumb=${encodeURIComponent(crumb)}`;
          const { data } = await httpsGet(url, cookie);
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(data);
        } catch (e) {
          // Reset cache on failure so next request tries fresh
          cachedCrumb = null;
          cachedCookie = null;
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), yahooFinancePlugin()],
});
