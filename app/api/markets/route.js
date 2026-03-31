export async function GET() {
  try {
    var r = await fetch("https://gamma-api.polymarket.com/events?closed=false&active=true&limit=100&order=volume24hr&ascending=false", { headers: { "Accept": "application/json" } });
    var data = await r.json();
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
