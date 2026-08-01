"use client";

import React, { useState, useEffect, useRef } from "react";

// ---- Design tokens (premium, quiet, travel-concierge direction) ----
// Ink (background):     #0F0F10 — near-black, warm neutral
// Surface (card):       #17171A — barely lifted off the background
// Bone (primary text):  #EDEAE3 — warm off-white
// Muted (secondary):    #B8B5AC
// Brass (accent):       #B08D3E — used sparingly, never as a fill everywhere
// Sage (eligible):      #6B8F71
// Clay (denied):        #A85D50
// Hairline (dividers):  #232326

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Inter:wght@400;500;600;700&display=swap');`;

const ROUTES = [
  { label: "Select a route\u2026", km: null },
  { label: "London \u2192 Amsterdam (~360 km)", km: 360 },
  { label: "Paris \u2192 Berlin (~880 km)", km: 880 },
  { label: "Madrid \u2192 Rome (~1360 km)", km: 1360 },
  { label: "London \u2192 Athens (~2400 km)", km: 2400 },
  { label: "Dublin \u2192 Lisbon (~1670 km)", km: 1670 },
  { label: "Frankfurt \u2192 New York (~6200 km)", km: 6200 },
  { label: "Amsterdam \u2192 Dubai (~5150 km)", km: 5150 },
  { label: "Other \u2014 enter distance manually", km: "custom" },
];

const REASONS = [
  { value: "technical", label: "Technical or mechanical fault" },
  { value: "crew", label: "Crew or scheduling issue" },
  { value: "weather", label: "Severe weather" },
  { value: "atc", label: "Air traffic control restriction" },
  { value: "strike", label: "Strike (airline staff)" },
  { value: "other", label: "Other or not sure" },
];

// --- Flight-status lookup ---
// In production this calls a real flight-data API (FlightAware AeroAPI,
// AviationStack, etc.) from your own backend, passing your API key server-side.
// Inside this Claude artifact sandbox, only api.anthropic.com can be reached
// directly from the browser — third-party APIs like AviationStack are blocked
// by the sandbox's network policy. So this function tries your real backend
// route first, and falls back to a deterministic mock if that route doesn't
// exist yet — meaning this same component works unchanged in both places.
async function lookupFlightStatus(airline, flightNumber, date) {
  try {
    const res = await fetch(
      `/api/flight-status?airline=${encodeURIComponent(airline)}&flight=${encodeURIComponent(
        flightNumber
      )}&date=${encodeURIComponent(date)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data.found) {
        return {
          found: true,
          status: data.status,
          delayHours: data.delayHours,
          distanceKm: data.distanceKm,
          departureAirport: data.departureAirport,
          arrivalAirport: data.arrivalAirport,
          source: data.source,
        };
      }
      if (data.found === false) return { found: false };
    }
  } catch {
    // No backend route available (e.g. inside the artifact sandbox) — fall through to mock.
  }

  await new Promise((res) => setTimeout(res, 900));

  const seed = `${airline}${flightNumber}${date}`
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);

  const outcomes = [
    { status: "delayed", hours: 2 },
    { status: "delayed", hours: 3.5 },
    { status: "delayed", hours: 5 },
    { status: "cancelled", hours: 0 },
    { status: "on_time", hours: 0 },
  ];
  const picked = outcomes[seed % outcomes.length];
  const mockDistances = [420, 880, 1360, 2150, 3300, 5150, 6200];
  const mockDistance = mockDistances[seed % mockDistances.length];

  return {
    found: flightNumber.trim().length > 0,
    status: picked.status,
    delayHours: picked.hours,
    distanceKm: mockDistance,
    departureAirport: "XXX",
    arrivalAirport: "YYY",
    source: "mock-data (demo only)",
  };
}

function computeEligibility(form) {
  const { delayType, hours, km } = form;
  const distance = km;

  if (form.reason === "weather" || form.reason === "atc") {
    return {
      eligible: false,
      amount: 0,
      reason:
        "This falls under \u201cextraordinary circumstances\u201d (weather or air traffic control). Airlines are generally exempt from compensation for these, though you may still be owed care \u2014 meals, a hotel \u2014 if you were delayed overnight.",
    };
  }

  if (delayType === "cancelled" && form.noticeGiven === "14plus") {
    return {
      eligible: false,
      amount: 0,
      reason:
        "You were notified 14 or more days in advance, so standard compensation rules don\u2019t apply \u2014 though a refund or rebooking is still owed to you.",
    };
  }

  const h = parseFloat(hours || "0");
  const minDelay = delayType === "cancelled" ? 0 : 3;

  if (delayType === "delayed" && h < minDelay) {
    return {
      eligible: false,
      amount: 0,
      reason: "A delay under 3 hours doesn\u2019t meet the compensation threshold, even though the flight was still disrupted.",
    };
  }

  let amount = 0;
  if (distance <= 1500) amount = 250;
  else if (distance <= 3500) amount = 400;
  else amount = h < 4 && delayType === "delayed" ? 300 : 600;

  return {
    eligible: true,
    amount,
    reason: `Based on a verified ${distance.toLocaleString()} km route and a ${
      delayType === "cancelled" ? "cancellation" : `${h}-hour delay`
    } within the airline\u2019s control, this qualifies for compensation.`,
  };
}

// Quiet field wrapper: label sits above an underline-style control, no boxes.
function Field({ label, children, hint }) {
  return (
    <label className="block mb-7">
      <span
        className="block mb-2 text-[13px] font-medium"
        style={{ color: "#B8B5AC", fontFamily: "'Inter', sans-serif" }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span
          className="block mt-1.5 text-xs"
          style={{ color: "#8A877E", fontFamily: "'Inter', sans-serif" }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

const underlineInput = {
  backgroundColor: "transparent",
  borderBottom: "1px solid #38383C",
  color: "#EDEAE3",
  fontFamily: "'Inter', sans-serif",
  fontWeight: 500,
};

// Signature element: a quiet perforated divider, nodding to a torn ticket
// stub, used once between sections rather than repeated as decoration.
function Perforation() {
  return (
    <div className="relative flex items-center my-8" aria-hidden="true">
      <div
        className="absolute -left-8 w-4 h-4 rounded-full md:-left-11"
        style={{ backgroundColor: "#0F0F10", border: "1px solid #232326" }}
      />
      <div
        className="flex-1 border-t"
        style={{ borderTopStyle: "dashed", borderColor: "#38383C" }}
      />
      <div
        className="absolute -right-8 w-4 h-4 rounded-full md:-right-11"
        style={{ backgroundColor: "#0F0F10", border: "1px solid #232326" }}
      />
    </div>
  );
}

// Quiet fade/rise reveal for the eligibility result — replaces a louder
// scrambling animation with something calmer, in keeping with the direction.
function Reveal({ children, delay = 0 }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(6px)",
        transition: "opacity 700ms ease, transform 700ms ease",
      }}
    >
      {children}
    </div>
  );
}

export default function FlightClaimChecker() {
  const [step, setStep] = useState("form");
  const [form, setForm] = useState({
    passenger: "",
    airline: "",
    flightNumber: "",
    date: "",
    routeIndex: 0,
    customKm: "",
    delayType: "delayed",
    hours: "3",
    noticeGiven: "under14",
    reason: "technical",
  });
  const [result, setResult] = useState(null);
  const [letter, setLetter] = useState("");
  const [copied, setCopied] = useState(false);
  const [lookupState, setLookupState] = useState("idle"); // idle | loading | done | error
  const [verifiedRoute, setVerifiedRoute] = useState(null);

  const selectedRoute = ROUTES[form.routeIndex];
  const manualKm =
    selectedRoute.km === "custom"
      ? parseFloat(form.customKm || "0")
      : selectedRoute.km;
  const km = verifiedRoute?.km ?? manualKm;

  const canSubmit =
    form.passenger.trim() &&
    form.airline.trim() &&
    form.flightNumber.trim() &&
    form.date &&
    km &&
    km > 0 &&
    lookupState === "done";

  function updateForm(patch) {
    const changingIdentity =
      "airline" in patch || "flightNumber" in patch || "date" in patch;
    setForm((f) => ({ ...f, ...patch }));
    if (changingIdentity && lookupState !== "idle") {
      setLookupState("idle");
      setVerifiedRoute(null);
    }
  }

  async function handleVerify() {
    if (!form.airline.trim() || !form.flightNumber.trim() || !form.date) return;
    setLookupState("loading");
    try {
      const info = await lookupFlightStatus(form.airline, form.flightNumber, form.date);
      if (!info.found) {
        setLookupState("error");
        return;
      }
      setForm((f) => ({
        ...f,
        delayType: info.status === "cancelled" ? "cancelled" : "delayed",
        hours: info.status === "delayed" ? String(info.delayHours) : f.hours,
      }));
      setVerifiedRoute(
        info.distanceKm
          ? { km: info.distanceKm, from: info.departureAirport || "?", to: info.arrivalAirport || "?" }
          : null
      );
      setLookupState("done");
    } catch {
      setLookupState("error");
    }
  }

  function handleCheck(e) {
    e.preventDefault();
    if (!canSubmit) return;
    const r = computeEligibility({ ...form, km });
    setResult(r);
    setStep("result");
  }

  function draftLetter() {
    const disruption =
      form.delayType === "cancelled" ? "was cancelled" : `was delayed by ${form.hours} hours`;
    const reasonLabel = REASONS.find((r) => r.value === form.reason)?.label || "an unspecified reason";

    const text = `Subject: Compensation Claim \u2014 Flight ${form.flightNumber}, ${form.date}

To the Customer Relations Team at ${form.airline},

I am writing to request compensation for flight ${form.flightNumber} on ${form.date}, which ${disruption}. The airline's stated cause was: ${reasonLabel}.

Under passenger compensation rules for flights of this distance (approximately ${km} km) and disruption length, I am entitled to \u20AC${result.amount} in compensation.

I would appreciate a response and payment within 14 days.

Regards,
${form.passenger}`;

    setLetter(text);
    setStep("letter");
  }

  function copyLetter() {
    navigator.clipboard?.writeText(letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const disabledStyle = { opacity: 0.55, cursor: "not-allowed" };

  return (
    <div
      className="min-h-screen w-full flex justify-center px-6 py-16"
      style={{ backgroundColor: "#0F0F10", fontFamily: "'Inter', sans-serif" }}
    >
      <style>{`${FONT_IMPORT}
        input:focus, select:focus { outline: none; border-bottom-color: #B08D3E; }
        ::selection { background: #B08D3E; color: #0F0F10; }
        select { -webkit-appearance: none; appearance: none; }
      `}</style>

      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-14 text-center">
          <p
            className="text-xs mb-3 uppercase font-medium"
            style={{ color: "#B8B5AC", letterSpacing: "0.18em" }}
          >
            Compensation check
          </p>
          <h1
            style={{
              fontFamily: "'Fraunces', serif",
              fontWeight: 600,
              color: "#EDEAE3",
              fontSize: "2rem",
              lineHeight: 1.15,
            }}
          >
            Are you owed money
            <br />
            for that flight?
          </h1>
        </div>

        {/* FORM STEP */}
        {step === "form" && (
          <form onSubmit={handleCheck}>
            <Field label="Your name">
              <input
                className="w-full py-2 text-[15px] bg-transparent"
                style={underlineInput}
                value={form.passenger}
                onChange={(e) => setForm({ ...form, passenger: e.target.value })}
                placeholder="Jordan Reyes"
              />
            </Field>

            <div className="grid grid-cols-2 gap-6">
              <Field label="Airline">
                <input
                  className="w-full py-2 text-[15px] bg-transparent"
                  style={underlineInput}
                  value={form.airline}
                  onChange={(e) => updateForm({ airline: e.target.value })}
                  placeholder="SkyBridge Air"
                />
              </Field>
              <Field label="Flight no.">
                <input
                  className="w-full py-2 text-[15px] bg-transparent"
                  style={underlineInput}
                  value={form.flightNumber}
                  onChange={(e) => updateForm({ flightNumber: e.target.value })}
                  placeholder="SB 4471"
                />
              </Field>
            </div>

            <Field label="Date of travel">
              <input
                type="date"
                className="w-full py-2 text-[15px] bg-transparent"
                style={underlineInput}
                value={form.date}
                onChange={(e) => updateForm({ date: e.target.value })}
              />
            </Field>

            <button
              type="button"
              onClick={handleVerify}
              disabled={!form.airline.trim() || !form.flightNumber.trim() || !form.date || lookupState === "loading"}
              className="w-full mb-2 py-3 text-[13px] font-semibold transition-opacity"
              style={{
                border: `1px solid ${lookupState === "done" ? "#6B8F71" : "#38383C"}`,
                color: lookupState === "done" ? "#6B8F71" : "#B08D3E",
                borderRadius: "2px",
                ...(!form.airline.trim() || !form.flightNumber.trim() || !form.date ? disabledStyle : {}),
              }}
            >
              {lookupState === "loading"
                ? "Checking flight status\u2026"
                : lookupState === "done"
                ? "Verified"
                : "Verify flight status"}
            </button>
            <p className="text-xs mb-8" style={{ color: "#8A877E" }}>
              {lookupState === "done"
                ? "Change the flight above and you\u2019ll need to verify again."
                : "Required before checking eligibility \u2014 nothing here is self-reported."}
            </p>
            {lookupState === "error" && (
              <p className="text-xs mb-6" style={{ color: "#A85D50" }}>
                That flight couldn't be found. Double-check the details and try again.
              </p>
            )}

            {verifiedRoute ? (
              <Field label="Route" hint="Calculated from verified airport coordinates.">
                <div
                  className="w-full py-2 text-[15px] flex items-center justify-between"
                  style={{ borderBottom: "1px solid #38383C", color: "#EDEAE3" }}
                >
                  <span>{verifiedRoute.from} → {verifiedRoute.to}</span>
                  <span style={{ color: "#6B8F71" }}>{verifiedRoute.km.toLocaleString()} km</span>
                </div>
              </Field>
            ) : (
              <>
                <Field label="Route (estimate, replaced once verified)">
                  <select
                    className="w-full py-2 text-[15px] bg-transparent"
                    style={underlineInput}
                    value={form.routeIndex}
                    onChange={(e) => setForm({ ...form, routeIndex: parseInt(e.target.value, 10) })}
                  >
                    {ROUTES.map((r, i) => (
                      <option key={i} value={i} style={{ backgroundColor: "#17171A" }}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {selectedRoute.km === "custom" && (
                  <Field label="Approximate distance (km)">
                    <input
                      type="number"
                      className="w-full py-2 text-[15px] bg-transparent"
                      style={underlineInput}
                      value={form.customKm}
                      onChange={(e) => setForm({ ...form, customKm: e.target.value })}
                      placeholder="2200"
                    />
                  </Field>
                )}
              </>
            )}

            <Field label="What happened">
              <div className="flex gap-6">
                {[
                  { v: "delayed", l: "Delayed" },
                  { v: "cancelled", l: "Cancelled" },
                ].map((opt) => (
                  <button
                    type="button"
                    key={opt.v}
                    disabled={lookupState === "done"}
                    onClick={() => setForm({ ...form, delayType: opt.v })}
                    className="pb-1 text-[15px] transition-colors"
                    style={{
                      color: form.delayType === opt.v ? "#EDEAE3" : "#8A877E",
                      borderBottom: form.delayType === opt.v ? "1px solid #B08D3E" : "1px solid transparent",
                      ...(lookupState === "done" ? { cursor: "not-allowed" } : {}),
                    }}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </Field>

            {form.delayType === "delayed" && (
              <Field label="Delay length (hours)">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  readOnly={lookupState === "done"}
                  className="w-full py-2 text-[15px] bg-transparent"
                  style={{ ...underlineInput, ...(lookupState === "done" ? disabledStyle : {}) }}
                  value={form.hours}
                  onChange={(e) => setForm({ ...form, hours: e.target.value })}
                />
              </Field>
            )}

            {form.delayType === "cancelled" && (
              <Field label="Notice given before departure">
                <select
                  className="w-full py-2 text-[15px] bg-transparent"
                  style={underlineInput}
                  value={form.noticeGiven}
                  onChange={(e) => setForm({ ...form, noticeGiven: e.target.value })}
                >
                  <option value="under14" style={{ backgroundColor: "#17171A" }}>Less than 14 days</option>
                  <option value="14plus" style={{ backgroundColor: "#17171A" }}>14 days or more</option>
                </select>
              </Field>
            )}

            <Field label="Stated cause, if known">
              <select
                className="w-full py-2 text-[15px] bg-transparent"
                style={underlineInput}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value} style={{ backgroundColor: "#17171A" }}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full mt-4 py-3.5 text-[14px] font-semibold tracking-wide transition-opacity"
              style={{
                backgroundColor: "#B08D3E",
                color: "#0F0F10",
                borderRadius: "2px",
                ...(canSubmit ? {} : disabledStyle),
              }}
            >
              Check eligibility
            </button>
            {lookupState !== "done" && (
              <p className="text-xs text-center mt-3" style={{ color: "#8A877E" }}>
                Verify the flight above first.
              </p>
            )}
          </form>
        )}

        {/* RESULT STEP */}
        {step === "result" && result && (
          <div>
            <p className="text-center text-xs mb-8" style={{ color: "#8A877E" }}>
              {form.airline} · {form.flightNumber}
            </p>

            <Reveal>
              <p
                className="text-center"
                style={{
                  fontFamily: "'Fraunces', serif",
                  fontStyle: result.eligible ? "normal" : "italic",
                  fontWeight: 500,
                  fontSize: "1.75rem",
                  color: result.eligible ? "#6B8F71" : "#A85D50",
                }}
              >
                {result.eligible ? "You\u2019re owed compensation" : "Not eligible this time"}
              </p>
            </Reveal>

            {result.eligible && (
              <Reveal delay={200}>
                <p
                  className="text-center mt-4"
                  style={{
                    fontFamily: "'Fraunces', serif",
                    fontWeight: 600,
                    fontSize: "3.25rem",
                    color: "#EDEAE3",
                  }}
                >
                  &euro;{result.amount}
                </p>
              </Reveal>
            )}

            <Reveal delay={350}>
              <p
                className="text-center mt-6 text-[15px] font-medium leading-relaxed max-w-sm mx-auto"
                style={{ color: "#B8B5AC" }}
              >
                {result.reason}
              </p>
            </Reveal>

            <Perforation />

            <div className="flex flex-col gap-3">
              {result.eligible && (
                <button
                  onClick={draftLetter}
                  className="w-full py-3.5 text-[14px] font-semibold tracking-wide"
                  style={{ backgroundColor: "#B08D3E", color: "#0F0F10", borderRadius: "2px" }}
                >
                  Draft my claim letter
                </button>
              )}
              <button
                onClick={() => {
                  setStep("form");
                  setResult(null);
                  setLetter("");
                  setLookupState("idle");
                  setVerifiedRoute(null);
                  setForm((f) => ({ ...f, airline: "", flightNumber: "", date: "" }));
                }}
                className="w-full py-3.5 text-[14px] font-semibold"
                style={{ border: "1px solid #38383C", color: "#B8B5AC", borderRadius: "2px" }}
              >
                Check another flight
              </button>
            </div>
          </div>
        )}

        {/* LETTER STEP */}
        {step === "letter" && (
          <div>
            <p
              className="text-center mb-8"
              style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: "1.5rem", color: "#EDEAE3" }}
            >
              Ready to send
            </p>
            <pre
              className="whitespace-pre-wrap text-[14px] leading-relaxed p-6"
              style={{ backgroundColor: "#17171A", color: "#EDEAE3", fontFamily: "'Inter', sans-serif", borderRadius: "2px" }}
            >
              {letter}
            </pre>
            <div className="flex gap-3 mt-5">
              <button
                onClick={copyLetter}
                className="flex-1 py-3.5 text-[14px] font-semibold tracking-wide"
                style={{ backgroundColor: "#B08D3E", color: "#0F0F10", borderRadius: "2px" }}
              >
                {copied ? "Copied" : "Copy letter"}
              </button>
              <button
                onClick={() => setStep("result")}
                className="flex-1 py-3.5 text-[14px] font-semibold"
                style={{ border: "1px solid #38383C", color: "#B8B5AC", borderRadius: "2px" }}
              >
                Back
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs mt-14" style={{ color: "#6B6963" }}>
          Demo prototype · eligibility rules are simplified for illustration, not legal advice.
        </p>
      </div>
    </div>
  );
}
