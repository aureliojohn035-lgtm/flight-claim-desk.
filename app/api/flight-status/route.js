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
    // NOTE: deliberately NOT sending flight_date here. AviationStack's free
    // plan rejects date-filtered lookups with a function_access_restricted
    // error (confirmed via /debug output) — historical/date-specific queries
    // are a paid-plan feature. Without it, this returns the flight's current
    // real-time status instead, which the free plan does support. Practical
    // effect: this only reliably verifies flights happening today, not a
    // date picked from the past or future. The `date` the person enters is
    // still used for the letter and for context, just not sent to the
    // provider. If you upgrade to a paid AviationStack plan later, add
    // `url.searchParams.set("flight_date", date);` back in to restore
    // date-specific verification.

    const providerRes = await fetch(url.toString(), {
      // Cache briefly — flight status changes, but not every second,
      // and this avoids burning API calls on repeated lookups of the same flight.
      next: { revalidate: 60 },
    });

    if (!providerRes.ok) {
      const rawBody = await providerRes.text().catch(() => "");
      return Response.json(
        {
          error: "Provider lookup failed",
          debug: {
            httpStatus: providerRes.status,
            rawBodySnippet: rawBody.slice(0, 400),
          },
        },
        { status: 502 }
      );
    }

    const data = await providerRes.json();

    // AviationStack returns HTTP 200 even on failure — the actual error lives
    // inside the JSON body. This most commonly happens on the free plan when
    // requesting a specific flight_date, since historical/date-filtered
    // lookups are a paid-plan feature there. Surface this clearly instead of
    // letting it look like "flight not found."
    if (data?.error) {
      return Response.json(
        {
          error: "provider-error",
          message: data.error.message || data.error.type || "AviationStack rejected the request",
          hint:
            data.error.code === "function_access_restricted" ||
            data.error.type === "function_access_restricted"
              ? "This usually means the free plan doesn't support date-filtered flight lookups. Check aviationstack.com/pricing for what your current plan includes."
              : undefined,
        },
        { status: 502 }
      );
    }

    const flight = data?.data?.[0];

    if (!flight) {
      return Response.json({ found: false });
    }

    const status = normalizeStatus(flight);
    const depIata = flight?.departure?.iata;
    const arrIata = flight?.arrival?.iata;

    // Since we no longer filter the provider query by date (free-plan
    // restriction), sanity-check the date the person entered against the
    // actual scheduled date AviationStack returned, and flag a mismatch so
    // the UI can warn them rather than silently showing the wrong day's data.
    const actualDate = (flight?.departure?.scheduled || "").slice(0, 10);
    const dateMismatch = actualDate && date && actualDate !== date;

    let distanceKm = null;
    let distanceSource = "unavailable";
    let distanceDebug = null;

    if (depIata && arrIata) {
      const [depResult, arrResult] = await Promise.all([
        lookupAirportCoords(depIata, apiKey),
        lookupAirportCoords(arrIata, apiKey),
      ]);
      if (depResult.coords && arrResult.coords) {
        distanceKm = Math.round(haversineKm(depResult.coords, arrResult.coords));
        distanceSource = "calculated-from-verified-airports";
      } else {
        // Airport coordinate lookup failed — capture why, since this is the
        // same class of silent failure that caused the flight_date issue.
        distanceDebug = { departure: depResult.debug, arrival: arrResult.debug };
      }
    }

    return Response.json({
      found: true,
      status: status.type, // "delayed" | "cancelled"
      delayHours: status.delayHours,
      departureAirport: depIata,
      arrivalAirport: arrIata,
      distanceKm,
      distanceSource,
      distanceDebug,
      actualDate,
      dateMismatch,
      source: "aviationstack",
    });
  } catch (err) {
    return Response.json({ error: "Lookup failed", debug: { message: err?.message } }, { status: 500 });
  }
}

async function lookupAirportCoords(iataCode, apiKey) {
  try {
    const url = new URL(AIRPORTS_BASE);
    url.searchParams.set("access_key", apiKey);
    url.searchParams.set("search", iataCode);

    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    const raw = await res.text();

    if (!res.ok) {
      return { coords: null, debug: { iataCode, httpStatus: res.status, rawBodySnippet: raw.slice(0, 300) } };
    }

    const data = JSON.parse(raw);

    if (data?.error) {
      return { coords: null, debug: { iataCode, providerError: data.error } };
    }

    const airport = (data?.data || []).find(
      (a) => a.iata_code === iataCode || a.iata === iataCode
    );
    if (!airport) {
      return { coords: null, debug: { iataCode, note: "No matching airport in response", resultCount: (data?.data || []).length } };
    }

    const lat = parseFloat(airport.latitude ?? airport.lat);
    const lon = parseFloat(airport.longitude ?? airport.lon ?? airport.lng);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return { coords: null, debug: { iataCode, note: "No usable lat/lon field on airport record", sampleKeys: Object.keys(airport) } };
    }

    return { coords: { lat, lon }, debug: null };
  } catch (err) {
    return { coords: null, debug: { iataCode, note: "Exception thrown", message: err?.message } };
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

  // Always report the actual delay, even if it's small or zero — don't
  // silently bucket short delays into an "on_time" state the frontend
  // doesn't know how to handle. The 3-hour eligibility threshold is applied
  // later, so a 27-minute delay correctly shows as "delayed, 0.4 hours"
  // rather than disappearing into an unhandled status.
  if (scheduledDep && actualDep) {
    const delayMs = new Date(actualDep) - new Date(scheduledDep);
    const delayHours = Math.max(0, delayMs / (1000 * 60 * 60));
    return { type: "delayed", delayHours: Math.round(delayHours * 10) / 10 };
  }

  return { type: "delayed", delayHours: 0 };
}
