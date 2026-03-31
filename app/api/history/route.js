export async function GET(request) {
  var url = new URL(request.url);
  var token = url.searchParams.get("token");
  var interval = url.searchParams.get("interval") || "1d";
  var fidelity = url.searchParams.get("fidelity") || "60";
  if (!token) return new Response(JSON.stringify({ error: "missing token" }), { status: 400 });
  try {
    var r = await fetch("https://clob.polymarket.com/prices-history?market=" + token + "&interval=" + interval + "&fidelity=" + fidelity);
    var data = await r.json();
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
