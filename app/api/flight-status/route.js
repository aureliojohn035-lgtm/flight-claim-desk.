// app/api/flight-status/route.js
//
// Next.js (App Router) API route that looks up real flight status.
// Runs server-side only, so your provider API key is never exposed to the browser.
//
// Setup:
//   1. Sign up for a flight-data provider. Two common choices:
//      - AviationStack (aviationstack.com) — simple REST API, generous free tier
//        - FlightAware AeroAPI (flightaware.com/commercial/aeroapi) — more accurate,
//          paid from the start, better for a real product
//   2. Add your key to .env.local:
//        AVIATIONSTACK_API_KEY=your_key_here
//   3. Frontend calls: fetch("/api/flight-status?airline=SB&flight=4471&date=2026-07-20")
//      instead of the mock lookupFlightStatus() function in the artifact.

const AVIATIONSTACK_BASE = "http://api.aviationstack.com/v1/flights";

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
    const url = new URL(AVIATIONSTACK_BASE);
    url.searchParams.set("access_key", apiKey);
    url.searchParams.set("flight_iata", `${airline}${flightNumber}`);
    url.searchParams.set("flight_date", date);

    const providerRes = await fetch(url.toString(), {
      // Cache briefly — flight status changes, but not every second,
      // and this avoids burning API calls on repeated lookups of the same flight.
      next: { revalidate: 60 },
    });

    if (!providerRes.ok) {
      return Response.json(
        { error: "Provider lookup failed" },
        { status: 502 }
      );
    }

    const data = await providerRes.json();
    const flight = data?.data?.[0];

    if (!flight) {
      return Response.json({ found: false });
    }

    // Normalize the provider's response into the shape the frontend expects.
    const status = normalizeStatus(flight);

    return Response.json({
      found: true,
      status: status.type, // "delayed" | "cancelled" | "on_time"
      delayHours: status.delayHours,
      departureAirport: flight?.departure?.iata,
      arrivalAirport: flight?.arrival?.iata,
      source: "aviationstack",
    });
  } catch (err) {
    return Response.json({ error: "Lookup failed" }, { status: 500 });
  }
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
