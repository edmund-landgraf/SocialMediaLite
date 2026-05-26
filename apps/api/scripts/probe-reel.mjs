import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const reelId = process.argv[2] ?? "997142959398813";
const reelUrl = `https://www.facebook.com/reel/${reelId}`;
const v = process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v20.0";
const appId = process.env.FACEBOOK_APP_ID?.trim();
const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();

async function probe(label, url, headers = {}) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  console.log(`\n--- ${label} ${res.status} len=${text.length} ---`);
  const ogTitle = text.match(/property="og:title"\s+content="([^"]+)"/i)?.[1];
  const ogDesc = text.match(/property="og:description"\s+content="([^"]+)"/i)?.[1];
  const ogImg = text.match(/property="og:image"\s+content="([^"]+)"/i)?.[1];
  const fbcdn = text.match(/https:\/\/[^"'\s]*fbcdn[^"'\s]*/i)?.[0];
  if (ogTitle || ogDesc || ogImg || fbcdn) {
    console.log("og:title", ogTitle);
    console.log("og:desc", ogDesc?.slice(0, 160));
    console.log("og:image", ogImg?.slice(0, 160));
    console.log("fbcdn", fbcdn?.slice(0, 160));
  } else {
    console.log(text.slice(0, 800));
  }
  return text;
}

const embedPlugin =
  "https://www.facebook.com/plugins/video.php?href=" +
  encodeURIComponent(reelUrl) +
  "&show_text=false&width=476";

await probe("embed-plugin", embedPlugin, {
  "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)",
});

if (appId && appSecret) {
  const appToken = `${appId}|${appSecret}`;
  const fields = "name,description,picture,format,permalink_url,embed_html,from{name}";
  await probe(
    "graph-video",
    `https://graph.facebook.com/${v}/${reelId}?fields=${encodeURIComponent(fields)}&access_token=${appToken}`,
  );
  await probe(
    "graph-oembed",
    `https://graph.facebook.com/${v}/oembed_video?url=${encodeURIComponent(reelUrl)}&access_token=${appToken}`,
  );
} else {
  console.log("\n(no FACEBOOK_APP_ID/SECRET in .env)");
}
