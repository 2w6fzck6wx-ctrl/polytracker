export async function GET(request) {
  var url = new URL(request.url);
  var type = url.searchParams.get("type") || "leaderboard";
  var base = "https://data-api.polymarket.com";
  var target = "";

  if (type === "leaderboard") {
    var window = url.searchParams.get("window") || "volume";
    var period = url.searchParams.get("period") || "30d";
    target = base + "/leaderboard?window=" + period + "&sortBy=" + window + "&limit=25";
  } else if (type === "positions") {
    var user = url.searchParams.get("user");
    if (!user) return new Response(JSON.stringify({ error: "missing user" }), { status: 400 });
    target = base + "/positions?user=" + user + "&sortBy=CURRENT&sortDirection=DESC&sizeThreshold=0.1&limit=20";
  } else if (type === "activity") {
    var user2 = url.searchParams.get("user");
    if (!user2) return new Response(JSON.stringify({ error: "missing user" }), { status: 400 });
    target = base + "/activity?user=" + user2 + "&type=TRADE&limit=30&sortBy=TIMESTAMP&sortDirection=DESC";
  } else if (type === "holders") {
    var token = url.searchParams.get("token");
    if (!token) return new Response(JSON.stringify({ error: "missing token" }), { status: 400 });
    target = "https://data-api.polymarket.com/holders?token_id=" + token + "&limit=20";
  } else if (type === "profile") {
    var addr = url.searchParams.get("address");
    if (!addr) return new Response(JSON.stringify({ error: "missing address" }), { status: 400 });
    target = "https://gamma-api.polymarket.com/profiles/" + addr;
  }

  if (!target) return new Response(JSON.stringify({ error: "invalid type" }), { status: 400 });

  try {
    var r = await fetch(target, { headers: { "Accept": "application/json" } });
    var data = await r.json();
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
