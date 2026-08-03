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

// Static coordinates for ~180 major world airports, covering the large
// majority of routes people actually file compensation claims for. This
// exists because AviationStack's free plan rejects the /v1/airports
// endpoint (function_access_restricted, confirmed via live testing) — so
// rather than depend on a paid plan, distance is calculated locally from
// known coordinates whenever the airport is in this table. [lat, lon]
const AIRPORT_COORDS = {
  // North America
  ATL: [33.6407, -84.4277], LAX: [33.9416, -118.4085], ORD: [41.9742, -87.9073],
  DFW: [32.8998, -97.0403], DEN: [39.8561, -104.6737], JFK: [40.6413, -73.7781],
  SFO: [37.6213, -122.3790], SEA: [47.4502, -122.3088], LAS: [36.0840, -115.1537],
  MCO: [28.4312, -81.3081], MIA: [25.7959, -80.2870], PHX: [33.4352, -112.0101],
  IAH: [29.9902, -95.3368], BOS: [42.3656, -71.0096], EWR: [40.6895, -74.1745],
  MSP: [44.8848, -93.2223], DTW: [42.2124, -83.3534], PHL: [39.8729, -75.2437],
  LGA: [40.7769, -73.8740], BWI: [39.1774, -76.6684], SLC: [40.7899, -111.9791],
  SAN: [32.7338, -117.1933], TPA: [27.9755, -82.5332], DCA: [38.8512, -77.0402],
  IAD: [38.9531, -77.4565], AUS: [30.1975, -97.6664], YYZ: [43.6777, -79.6248],
  YVR: [49.1967, -123.1815], YUL: [45.4706, -73.7408], MEX: [19.4363, -99.0721],
  CUN: [21.0365, -86.8771],
  // South America
  GRU: [-23.4356, -46.4731], GIG: [-22.8090, -43.2506], EZE: [-34.8222, -58.5358],
  BOG: [4.7016, -74.1469], LIM: [-12.0219, -77.1143], SCL: [-33.3930, -70.7858],
  UIO: [-0.1292, -78.3575], PTY: [9.0714, -79.3835],
  // Europe
  LHR: [51.4700, -0.4543], CDG: [49.0097, 2.5479], AMS: [52.3105, 4.7683],
  FRA: [50.0379, 8.5622], MAD: [40.4983, -3.5676], BCN: [41.2974, 2.0833],
  FCO: [41.8003, 12.2389], MXP: [45.6306, 8.7281], MUC: [48.3538, 11.7861],
  ZRH: [47.4647, 8.5492], VIE: [48.1103, 16.5697], CPH: [55.6180, 12.6560],
  ARN: [59.6519, 17.9186], OSL: [60.1976, 11.1004], HEL: [60.3172, 24.9633],
  DUB: [53.4213, -6.2701], LIS: [38.7813, -9.1359], ATH: [37.9364, 23.9445],
  IST: [41.2753, 28.7519], SVO: [55.9736, 37.4125], WAW: [52.1657, 20.9671],
  PRG: [50.1008, 14.2632], BUD: [47.4298, 19.2611], BRU: [50.9014, 4.4844],
  GVA: [46.2381, 6.1090], MAN: [53.3537, -2.2750], EDI: [55.9508, -3.3615],
  LGW: [51.1537, -0.1821], STN: [51.8850, 0.2350], NCE: [43.6584, 7.2159],
  ORY: [48.7233, 2.3794], DUS: [51.2895, 6.7668], HAM: [53.6304, 9.9882],
  BER: [52.3667, 13.5033], MLA: [35.8575, 14.4775], LCA: [34.8751, 33.6249],
  KEF: [63.9850, -22.6056], OPO: [41.2481, -8.6814],
  // Middle East
  DXB: [25.2532, 55.3657], DOH: [25.2731, 51.6081], AUH: [24.4330, 54.6511],
  RUH: [24.9576, 46.6988], JED: [21.6796, 39.1565], TLV: [32.0114, 34.8867],
  AMM: [31.7226, 35.9932], BEY: [33.8209, 35.4884], KWI: [29.2266, 47.9689],
  // Africa
  JNB: [-26.1367, 28.2411], CPT: [-33.9648, 18.6017], NBO: [-1.3192, 36.9278],
  ADD: [8.9779, 38.7993], CAI: [30.1219, 31.4056], LOS: [6.5774, 3.3212],
  ACC: [5.6052, -0.1668], CMN: [33.3675, -7.5900], TUN: [36.8510, 10.2272],
  ALG: [36.6910, 3.2154], DAR: [-6.8781, 39.2026], EBB: [0.0424, 32.4435],
  KGL: [-1.9686, 30.1395], LUN: [-15.3308, 28.4526], HRE: [-17.9318, 31.0928],
  MRU: [-20.4302, 57.6836], SEZ: [-4.6743, 55.5218], ABJ: [5.2614, -3.9263],
  DKR: [14.6708, -17.0733], LAD: [-8.8584, 13.2312], MPM: [-25.9208, 32.5726],
  // Asia
  HND: [35.5494, 139.7798], NRT: [35.7720, 140.3929], ICN: [37.4602, 126.4407],
  PVG: [31.1443, 121.8083], PEK: [40.0801, 116.5846], PKX: [39.5098, 116.4109],
  HKG: [22.3080, 113.9185], TPE: [25.0777, 121.2328], SIN: [1.3644, 103.9915],
  BKK: [13.6900, 100.7501], KUL: [2.7456, 101.7099], CGK: [-6.1256, 106.6559],
  MNL: [14.5086, 121.0198], DEL: [28.5562, 77.1000], BOM: [19.0896, 72.8656],
  BLR: [13.1986, 77.7066], MAA: [12.9941, 80.1709], HYD: [17.2403, 78.4294],
  CCU: [22.6547, 88.4467], KTM: [27.6966, 85.3591], DAC: [23.8433, 90.3978],
  CMB: [7.1808, 79.8841], KHI: [24.9065, 67.1608], ISB: [33.6167, 73.0994],
  ALA: [43.3521, 77.0405], TAS: [41.2579, 69.2812], HAN: [21.2212, 105.8072],
  SGN: [10.8188, 106.6520], RGN: [16.9073, 96.1332], PNH: [11.5466, 104.8441],
  VTE: [17.9883, 102.5633], ULN: [47.6431, 106.8216], KIX: [34.4347, 135.2440],
  NGO: [34.8584, 136.8054], FUK: [33.5859, 130.4510], CTS: [42.7752, 141.6923],
  // Oceania
  SYD: [-33.9399, 151.1753], MEL: [-37.6690, 144.8410], BNE: [-27.3842, 153.1175],
  PER: [-31.9385, 115.9672], AKL: [-37.0082, 174.7850], NAN: [-17.7554, 177.4434],
  POM: [-9.4434, 147.2200],
};


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
  const local = AIRPORT_COORDS[iataCode];
  if (local) {
    return { coords: { lat: local[0], lon: local[1] }, debug: null };
  }

  // Not in the local table — fall back to AviationStack's airports endpoint.
  // On the free plan this will fail with function_access_restricted (a
  // confirmed, known limitation), but the fallback stays in place so
  // upgrading to a paid AviationStack plan later automatically extends
  // coverage to airports outside the local table, with no code changes.
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
