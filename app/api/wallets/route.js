export async function GET(request) {
  var url = new URL(request.url);
  var type = url.searchParams.get("type") || "leaderboard";
  var target = "";

  if (type === "leaderboard") {
    target = "https://gamma-api.polymarket.com/profiles?order=volume&ascending=false&limit=25";
  } else if (type === "positions") {
    var user = url.searchParams.get("user");
    if (!user) return new Response(JSON.stringify({ error: "missing user" }), { status: 400 });
    target = "https://data-api.polymarket.com/positions?user=" + user + "&sortBy=CURRENT&sortDirection=DESC&sizeThreshold=0.1&limit=20";
  } else if (type === "activity") {
    var user2 = url.searchParams.get("user");
    if (!user2) return new Response(JSON.stringify({ error: "missing user" }), { status: 400 });
    target = "https://data-api.polymarket.com/activity?user=" + user2 + "&type=TRADE&limit=20&sortBy=TIMESTAMP&sortDirection=DESC";
  }

  if (!target) return new Response(JSON.stringify({ error: "invalid type" }), { status: 400 });

  try {
    var r = await fetch(target, { headers: { "Accept": "application/json" } });
    if (!r.ok) {
      var txt = await r.text();
      return new Response(JSON.stringify({ error: "API " + r.status, detail: txt.substring(0, 200) }), { status: 502 });
    }
    var data = await r.json();
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
