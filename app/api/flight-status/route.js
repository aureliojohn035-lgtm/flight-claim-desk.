// app/api/flight-status/route.js
//
// Next.js (App Router) API route that looks up real flight status AND the
// real route distance, so nothing about the eligibility calculation is
// self-reported by the person filling in the form.
//
// Runs server-side only, so your provider API key is never exposed to the browser.
//
// Setup:
//   1. Sign up for a flight-data provider. Two common choices:
//      - AviationStack (aviationstack.com) — simple REST API, generous free tier
//      - FlightAware AeroAPI (flightaware.com/commercial/aeroapi) — more accurate,
//        paid from the start, better for a real product
//   2. Add your key to .env.local:
//        AVIATIONSTACK_API_KEY=your_key_here
//   3. Frontend calls: fetch("/api/flight-status?airline=SB&flight=4471&date=2026-07-20")
//      instead of the mock lookupFlightStatus() function in the artifact.
//
// NOTE on API shape: AviationStack's exact field names have shifted between
// plan tiers and API versions in the past. Log a raw response from your own
// key once and confirm `latitude` / `longitude` are the field names your
// account returns before relying on this in production — the airport lookup
// below is written defensively (checks a couple of likely field names) but
// isn't a substitute for checking your actual response shape.

const FLIGHTS_BASE = "http://api.aviationstack.com/v1/flights";
const AIRPORTS_BASE = "http://api.aviationstack.com/v1/airports";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const airline = searchParams.get("airline");
  const flightNumber = searchParams.get("flight");
  const date = searchParams.get("date");

  if (!airline || !flightNumber || !date) {
    return Response.json(
      { error: "Missing required params: airline, flight, date" },
      { status: 400 }
    );
  }

  const apiKey = process.env.AVIATIONSTACK_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Server misconfigured: missing AVIATIONSTACK_API_KEY" },
      { status: 500 }
    );
  }

  try {
    const url = new URL(FLIGHTS_BASE);
    url.searchParams.set("access_key", apiKey);
    url.searchParams.set("flight_iata", `${airline}${flightNumber}`);
    url.searchParams.set("flight_date", date);

    const providerRes = await fetch(url.toString(), {
      // Cache briefly — flight status changes, but not every second,
      // and this avoids burning API calls on repeated lookups of the same flight.
      next: { revalidate: 60 },
    });

    if (!providerRes.ok) {
      return Response.json({ error: "Provider lookup failed" }, { status: 502 });
    }

    const data = await providerRes.json();
    const flight = data?.data?.[0];

    if (!flight) {
      return Response.json({ found: false });
    }

    const status = normalizeStatus(flight);
    const depIata = flight?.departure?.iata;
    const arrIata = flight?.arrival?.iata;

    let distanceKm = null;
    let distanceSource = "unavailable";

    if (depIata && arrIata) {
      const [depCoords, arrCoords] = await Promise.all([
        lookupAirportCoords(depIata, apiKey),
        lookupAirportCoords(arrIata, apiKey),
      ]);
      if (depCoords && arrCoords) {
        distanceKm = Math.round(haversineKm(depCoords, arrCoords));
        distanceSource = "calculated-from-verified-airports";
      }
    }

    return Response.json({
      found: true,
      status: status.type, // "delayed" | "cancelled" | "on_time"
      delayHours: status.delayHours,
      departureAirport: depIata,
      arrivalAirport: arrIata,
      distanceKm,
      distanceSource,
      source: "aviationstack",
    });
  } catch (err) {
    return Response.json({ error: "Lookup failed" }, { status: 500 });
  }
}

async function lookupAirportCoords(iataCode, apiKey) {
  try {
    const url = new URL(AIRPORTS_BASE);
    url.searchParams.set("access_key", apiKey);
    url.searchParams.set("search", iataCode);

    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    if (!res.ok) return null;

    const data = await res.json();
    const airport = (data?.data || []).find(
      (a) => a.iata_code === iataCode || a.iata === iataCode
    );
    if (!airport) return null;

    const lat = parseFloat(airport.latitude ?? airport.lat);
    const lon = parseFloat(airport.longitude ?? airport.lon ?? airport.lng);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

    return { lat, lon };
  } catch {
    return null;
  }
}

// Great-circle distance between two lat/lon points, in kilometers.
function haversineKm(a, b) {
  const R = 6371; // Earth's radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function normalizeStatus(flight) {
  const flightStatus = flight?.flight_status; // "scheduled" | "active" | "landed" | "cancelled" | "incident" | "diverted"
  const scheduledDep = flight?.departure?.scheduled;
  const actualDep = flight?.departure?.actual || flight?.departure?.estimated;

  if (flightStatus === "cancelled") {
    return { type: "cancelled", delayHours: 0 };
  }

  if (scheduledDep && actualDep) {
    const delayMs = new Date(actualDep) - new Date(scheduledDep);
    const delayHours = Math.max(0, delayMs / (1000 * 60 * 60));
    if (delayHours >= 1) {
      return { type: "delayed", delayHours: Math.round(delayHours * 10) / 10 };
    }
  }

  return { type: "on_time", delayHours: 0 };
}
