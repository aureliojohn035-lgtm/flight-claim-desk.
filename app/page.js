"use client";
  
import React, { useState, useEffect, useRef } from "react";

// ---- Design tokens ----
// Background:   #0B0E11 (board casing, near-black with warmth)
// Panel:        #14181C
// Amber flap:   #FFB000 (Solari-board amber)
// Off-white:    #E8E6E1
// Eligible:     #3FA34D (muted signal green)
// Denied:       #C1443C (muted brick red)
// Divider:      #2A2F35

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');`;

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
  { value: "technical", label: "Technical / mechanical fault" },
  { value: "crew", label: "Crew or scheduling issue" },
  { value: "weather", label: "Severe weather" },
  { value: "atc", label: "Air traffic control restriction" },
  { value: "strike", label: "Strike (airline staff)" },
  { value: "other", label: "Other / not sure" },
];

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\u20AC .";

function randChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

// Split-flap style reveal: scrambles then settles on target text
function SplitFlap({ text, size = "text-4xl", color = "#FFB000", speed = 28, delay = 0 }) {
  const [display, setDisplay] = useState(() => text.split("").map(() => " "));
  const settledRef = useRef(0);

  useEffect(() => {
    settledRef.current = 0;
    setDisplay(text.split("").map(() => " "));
    let cancelled = false;
    const startTimeout = setTimeout(() => {
      const interval = setInterval(() => {
        if (cancelled) return;
        settledRef.current += 1;
        const settledCount = settledRef.current;
        setDisplay(
          text.split("").map((ch, i) => {
            if (i < settledCount) return ch;
            if (ch === " ") return " ";
            return randChar();
          })
        );
        if (settledCount >= text.length) clearInterval(interval);
      }, speed);
      return () => clearInterval(interval);
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(startTimeout);
    };
  }, [text, speed, delay]);

  return (
    <span
      className={`font-mono ${size} tracking-wide`}
      style={{ color, textShadow: `0 0 18px ${color}33` }}
    >
      {display.join("")}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-5">
      <span
        className="block mb-1.5 text-xs uppercase tracking-[0.15em] font-semibold"
        style={{ color: "#8A8F96" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle = {
  backgroundColor: "#0B0E11",
  border: "1px solid #2A2F35",
  color: "#E8E6E1",
};

// --- Flight-status lookup ---
// In production this calls a real flight-data API (FlightAware AeroAPI,
// AviationStack, etc.) from your own backend, passing your API key server-side.
// Inside this Claude artifact sandbox, only api.anthropic.com can be reached
// directly from the browser — third-party APIs like FlightAware are blocked
// by the sandbox's network policy. So this function is a realistic mock:
// swap the body below for a real fetch() to your backend once this is
// deployed as a standalone app with its own server.
async function lookupFlightStatus(airline, flightNumber, date) {
  // When this app is deployed standalone (see app/api/flight-status/route.js),
  // this hits your own backend, which holds the provider API key server-side.
  // Inside the Claude artifact sandbox that route doesn't exist, so this call
  // fails silently and falls through to the deterministic mock below —
  // meaning this same component works in both environments unchanged.
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
          source: data.source,
        };
      }
      if (data.found === false) return { found: false };
    }
  } catch {
    // No backend route available (e.g. inside the artifact sandbox) — fall through to mock.
  }

  await new Promise((res) => setTimeout(res, 900)); // simulate network latency

  // Deterministic mock: derive a pseudo-random but stable result from the
  // input string, so the same flight number always returns the same result
  // in this demo (useful for testing the UI repeatedly).
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

  return {
    found: flightNumber.trim().length > 0,
    status: picked.status, // "delayed" | "cancelled" | "on_time"
    delayHours: picked.hours,
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
        "This falls under \u201Cextraordinary circumstances\u201D (weather or air traffic control). Airlines are generally exempt from compensation for these, though you may still be owed care (meals, hotel) if you were delayed overnight.",
    };
  }

  if (delayType === "cancelled" && form.noticeGiven === "14plus") {
    return {
      eligible: false,
      amount: 0,
      reason:
        "You were notified of the cancellation 14 or more days in advance, so standard compensation rules don\u2019t apply here \u2014 though a refund or rebooking is still owed.",
    };
  }

  const h = parseFloat(hours || "0");
  const minDelay = delayType === "cancelled" ? 0 : 3;

  if (delayType === "delayed" && h < minDelay) {
    return {
      eligible: false,
      amount: 0,
      reason: `A delay under 3 hours doesn\u2019t meet the compensation threshold under EU261-style rules, even though the flight was still disrupted.`,
    };
  }

  let amount = 0;
  if (distance <= 1500) amount = 250;
  else if (distance <= 3500) amount = 400;
  else amount = h < 4 && delayType === "delayed" ? 300 : 600;

  return {
    eligible: true,
    amount,
    reason: `Based on a ${distance.toLocaleString()} km route and a ${
      delayType === "cancelled" ? "cancellation" : `${h}-hour delay`
    } within the airline\u2019s control, this qualifies for compensation.`,
  };
}

export default function FlightClaimChecker() {
  const [step, setStep] = useState("form"); // form | result | letter
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
  const [loadingLetter, setLoadingLetter] = useState(false);
  const [letterError, setLetterError] = useState("");
  const [copied, setCopied] = useState(false);
  const [lookupState, setLookupState] = useState("idle"); // idle | loading | done | error

  const selectedRoute = ROUTES[form.routeIndex];
  const km =
    selectedRoute.km === "custom"
      ? parseFloat(form.customKm || "0")
      : selectedRoute.km;

  const canSubmit =
    form.passenger.trim() &&
    form.airline.trim() &&
    form.flightNumber.trim() &&
    form.date &&
    km &&
    km > 0;

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
    // Free version: builds the letter locally from a template — no API call,
    // no cost, works instantly offline. Swap this back for the AI-drafted
    // version (see draft-letter-route.js) once you're ready to spend a few
    // dollars in API credits for more natural, varied letters.
    setLetterError("");
    const disruption =
      form.delayType === "cancelled"
        ? "was cancelled"
        : `was delayed by ${form.hours} hours`;
    const reasonLabel = REASONS.find((r) => r.value === form.reason)?.label || "an unspecified reason";

    const text = `Subject: Compensation Claim \u2014 Flight ${form.flightNumber}, ${form.date}

To the Customer Relations Team at ${form.airline},

I am writing to request compensation for flight ${form.flightNumber} on ${form.date}, which ${disruption}. The airline's stated cause was: ${reasonLabel}.

Under passenger compensation rules for flights of this distance (approximately ${km} km) and disruption length, I am entitled to \u20AC${result.amount} in compensation.

I would appreciate a response and payment within 14 days. Please let me know if you require any further information from me to process this claim.

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

  return (
    <div
      className="min-h-screen w-full flex justify-center px-4 py-10"
      style={{ backgroundColor: "#0B0E11", fontFamily: "'IBM Plex Sans', sans-serif" }}
    >
      <style>{`${FONT_IMPORT}
        .flap-card { background: #14181C; border: 1px solid #2A2F35; }
        .flap-divider { border-top: 1px dashed #2A2F35; }
        input:focus, select:focus { outline: 2px solid #FFB000; outline-offset: 1px; }
        ::selection { background: #FFB000; color: #0B0E11; }
      `}</style>

      <div className="w-full max-w-xl">
        {/* Board header */}
        <div className="mb-6 text-center">
          <div
            className="inline-block px-6 py-4 rounded-sm flap-card"
            style={{ boxShadow: "0 0 0 4px #0B0E11, 0 8px 24px rgba(0,0,0,0.4)" }}
          >
            <SplitFlap text="FLIGHT CLAIM DESK" size="text-2xl md:text-3xl" speed={18} />
            <div
              className="mt-2 text-xs uppercase tracking-[0.25em] font-mono"
              style={{ color: "#8A8F96" }}
            >
              Compensation Eligibility &middot; Est. rules-based check
            </div>
          </div>
        </div>

        {/* FORM STEP */}
        {step === "form" && (
          <form
            onSubmit={handleCheck}
            className="flap-card rounded-md p-6 md:p-8"
          >
            <Field label="Your name">
              <input
                className="w-full px-3 py-2 rounded-sm text-sm"
                style={inputStyle}
                value={form.passenger}
                onChange={(e) => setForm({ ...form, passenger: e.target.value })}
                placeholder="Jordan Reyes"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Airline">
                <input
                  className="w-full px-3 py-2 rounded-sm text-sm"
                  style={inputStyle}
                  value={form.airline}
                  onChange={(e) => setForm({ ...form, airline: e.target.value })}
                  placeholder="SkyBridge Air"
                />
              </Field>
              <Field label="Flight number">
                <input
                  className="w-full px-3 py-2 rounded-sm text-sm font-mono"
                  style={inputStyle}
                  value={form.flightNumber}
                  onChange={(e) => setForm({ ...form, flightNumber: e.target.value })}
                  placeholder="SB 4471"
                />
              </Field>
            </div>

            <Field label="Date of travel">
              <input
                type="date"
                className="w-full px-3 py-2 rounded-sm text-sm"
                style={inputStyle}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>

            <button
              type="button"
              onClick={handleVerify}
              disabled={!form.airline.trim() || !form.flightNumber.trim() || !form.date || lookupState === "loading"}
              className="w-full mb-5 py-2.5 rounded-sm text-xs uppercase tracking-wider font-semibold transition-opacity"
              style={{
                border: "1px solid #2A2F35",
                color: "#FFB000",
                opacity: !form.airline.trim() || !form.flightNumber.trim() || !form.date ? 0.4 : 1,
              }}
            >
              {lookupState === "loading"
                ? "Checking flight status\u2026"
                : lookupState === "done"
                ? "\u2713 Status found \u2014 fields updated below"
                : "Verify flight status automatically"}
            </button>
            {lookupState === "error" && (
              <p className="text-xs mb-4" style={{ color: "#C1443C" }}>
                Couldn\u2019t find that flight. Enter details manually below.
              </p>
            )}

            <Field label="Route">
              <select
                className="w-full px-3 py-2 rounded-sm text-sm"
                style={inputStyle}
                value={form.routeIndex}
                onChange={(e) =>
                  setForm({ ...form, routeIndex: parseInt(e.target.value, 10) })
                }
              >
                {ROUTES.map((r, i) => (
                  <option key={i} value={i}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>

            {selectedRoute.km === "custom" && (
              <Field label="Approximate distance (km)">
                <input
                  type="number"
                  className="w-full px-3 py-2 rounded-sm text-sm"
                  style={inputStyle}
                  value={form.customKm}
                  onChange={(e) => setForm({ ...form, customKm: e.target.value })}
                  placeholder="2200"
                />
              </Field>
            )}

            <Field label="What happened">
              <div className="flex gap-2">
                {[
                  { v: "delayed", l: "Delayed" },
                  { v: "cancelled", l: "Cancelled" },
                ].map((opt) => (
                  <button
                    type="button"
                    key={opt.v}
                    onClick={() => setForm({ ...form, delayType: opt.v })}
                    className="flex-1 px-3 py-2 rounded-sm text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: form.delayType === opt.v ? "#FFB000" : "#0B0E11",
                      color: form.delayType === opt.v ? "#0B0E11" : "#E8E6E1",
                      border: "1px solid #2A2F35",
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
                  className="w-full px-3 py-2 rounded-sm text-sm"
                  style={inputStyle}
                  value={form.hours}
                  onChange={(e) => setForm({ ...form, hours: e.target.value })}
                />
              </Field>
            )}

            {form.delayType === "cancelled" && (
              <Field label="Notice given before departure">
                <select
                  className="w-full px-3 py-2 rounded-sm text-sm"
                  style={inputStyle}
                  value={form.noticeGiven}
                  onChange={(e) => setForm({ ...form, noticeGiven: e.target.value })}
                >
                  <option value="under14">Less than 14 days</option>
                  <option value="14plus">14 days or more</option>
                </select>
              </Field>
            )}

            <Field label="Stated cause (per airline, if known)">
              <select
                className="w-full px-3 py-2 rounded-sm text-sm"
                style={inputStyle}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full mt-2 py-3 rounded-sm font-semibold text-sm uppercase tracking-wider transition-opacity"
              style={{
                backgroundColor: "#FFB000",
                color: "#0B0E11",
                opacity: canSubmit ? 1 : 0.4,
              }}
            >
              Check eligibility
            </button>
          </form>
        )}

        {/* RESULT STEP */}
        {step === "result" && result && (
          <div className="flap-card rounded-md p-6 md:p-8 text-center">
            <div
              className="text-xs uppercase tracking-[0.2em] font-mono mb-3"
              style={{ color: "#8A8F96" }}
            >
              {form.airline} &middot; {form.flightNumber}
            </div>

            <SplitFlap
              text={result.eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}
              size="text-4xl md:text-5xl"
              color={result.eligible ? "#3FA34D" : "#C1443C"}
              speed={24}
            />

            {result.eligible && (
              <div className="mt-4">
                <SplitFlap
                  text={`\u20AC${result.amount}`}
                  size="text-3xl"
                  color="#FFB000"
                  speed={30}
                  delay={500}
                />
              </div>
            )}

            <p
              className="mt-5 text-sm leading-relaxed max-w-md mx-auto"
              style={{ color: "#B8BCC2" }}
            >
              {result.reason}
            </p>

            <div className="flap-divider my-6" />

            <div className="flex flex-col gap-3">
              {result.eligible && (
                <button
                  onClick={draftLetter}
                  disabled={loadingLetter}
                  className="w-full py-3 rounded-sm font-semibold text-sm uppercase tracking-wider"
                  style={{
                    backgroundColor: "#FFB000",
                    color: "#0B0E11",
                    opacity: loadingLetter ? 0.6 : 1,
                  }}
                >
                  {loadingLetter ? "Drafting letter\u2026" : "Draft my claim letter"}
                </button>
              )}
              <button
                onClick={() => {
                  setStep("form");
                  setResult(null);
                  setLetter("");
                }}
                className="w-full py-3 rounded-sm font-medium text-sm"
                style={{ border: "1px solid #2A2F35", color: "#B8BCC2" }}
              >
                Check another flight
              </button>
            </div>

            {letterError && (
              <p className="mt-3 text-sm" style={{ color: "#C1443C" }}>
                {letterError}
              </p>
            )}
          </div>
        )}

        {/* LETTER STEP */}
        {step === "letter" && (
          <div className="flap-card rounded-md p-6 md:p-8">
            <div
              className="text-xs uppercase tracking-[0.2em] font-mono mb-4"
              style={{ color: "#8A8F96" }}
            >
              Claim letter &middot; ready to send
            </div>
            <pre
              className="whitespace-pre-wrap text-sm leading-relaxed p-4 rounded-sm font-mono"
              style={{ backgroundColor: "#0B0E11", border: "1px solid #2A2F35", color: "#E8E6E1" }}
            >
              {letter}
            </pre>
            <div className="flex gap-3 mt-5">
              <button
                onClick={copyLetter}
                className="flex-1 py-3 rounded-sm font-semibold text-sm uppercase tracking-wider"
                style={{ backgroundColor: "#FFB000", color: "#0B0E11" }}
              >
                {copied ? "Copied" : "Copy letter"}
              </button>
              <button
                onClick={() => setStep("result")}
                className="flex-1 py-3 rounded-sm font-medium text-sm"
                style={{ border: "1px solid #2A2F35", color: "#B8BCC2" }}
              >
                Back
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs mt-6" style={{ color: "#565B62" }}>
          Demo prototype &middot; eligibility rules are simplified for illustration, not legal advice.
        </p>
      </div>
    </div>
  );
}
