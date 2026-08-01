"use client";

import React, { useState } from "react";

const REASONS = [
  { value: "technical", label: "Technical or mechanical fault" },
  { value: "crew", label: "Crew or scheduling issue" },
  { value: "weather", label: "Severe weather" },
  { value: "atc", label: "Air traffic control restriction" },
  { value: "strike", label: "Strike" },
  { value: "other", label: "Other" },
];

async function verifyFlight(airline, flightNumber, date) {
  const response = await fetch(
    `/api/flight-status?airline=${airline}&flight=${flightNumber}&date=${date}`
  );

  const data = await response.json();

  if (!data.verified) {
    throw new Error(data.error || "Flight not verified");
  }

  return data;
}

function calculateCompensation(distance, delay, cancelled) {
  if (cancelled) {
    return {
      eligible: true,
      amount:
        distance <= 1500
          ? 250
          : distance <= 3500
          ? 400
          : 600,
    };
  }

  if (delay < 3) {
    return {
      eligible: false,
      amount: 0,
    };
  }

  return {
    eligible: true,
    amount:
      distance <= 1500
        ? 250
        : distance <= 3500
        ? 400
        : 600,
  };
}

export default function FlightClaimChecker() {

  const [form, setForm] = useState({
    name:"",
    airline:"",
    flight:"",
    date:"",
    reason:"technical",
  });

  const [status,setStatus] = useState("idle");
  const [flight,setFlight] = useState(null);
  const [result,setResult] = useState(null);


  async function handleVerify(){

    try {

      setStatus("loading");

      const data = await verifyFlight(
        form.airline,
        form.flight,
        form.date
      );

      setFlight(data);
      setStatus("verified");

    } catch(error){

      setStatus("error");

    }

  }


  function handleSubmit(e){

    e.preventDefault();

    if(!flight) return;

    const result =
      calculateCompensation(
        flight.distanceKm,
        flight.delayHours,
        flight.status === "cancelled"
      );

    setResult(result);

  }  return (
    <main
      style={{
        minHeight:"100vh",
        background:"#0F0F10",
        color:"#EDEAE3",
        padding:"40px 20px",
        fontFamily:"Inter, Arial, sans-serif"
      }}
    >

      <div
        style={{
          maxWidth:"500px",
          margin:"auto"
        }}
      >

        <h1
          style={{
            fontFamily:"Georgia, serif",
            fontSize:"34px",
            marginBottom:"10px"
          }}
        >
          Flight Claim Checker
        </h1>


        <p
          style={{
            color:"#B8B5AC",
            marginBottom:"35px"
          }}
        >
          Verify your flight first. No estimates. No invented data.
        </p>



        <form onSubmit={handleSubmit}>


          <input
            placeholder="Your name"
            value={form.name}
            onChange={(e)=>
              setForm({
                ...form,
                name:e.target.value
              })
            }
            style={inputStyle}
          />


          <input
            placeholder="Airline code (example: BA)"
            value={form.airline}
            onChange={(e)=>
              setForm({
                ...form,
                airline:e.target.value.toUpperCase()
              })
            }
            style={inputStyle}
          />


          <input
            placeholder="Flight number (example: 249)"
            value={form.flight}
            onChange={(e)=>
              setForm({
                ...form,
                flight:e.target.value
              })
            }
            style={inputStyle}
          />



          <input
            type="date"
            value={form.date}
            onChange={(e)=>
              setForm({
                ...form,
                date:e.target.value
              })
            }
            style={inputStyle}
          />



          <select
            value={form.reason}
            onChange={(e)=>
              setForm({
                ...form,
                reason:e.target.value
              })
            }
            style={inputStyle}
          >

            {REASONS.map((r)=>(

              <option
                key={r.value}
                value={r.value}
              >
                {r.label}
              </option>

            ))}

          </select>



          <button
            type="button"
            onClick={handleVerify}
            style={buttonStyle}
          >

            {
              status==="loading"
              ?
              "Checking..."
              :
              "Verify Flight"
            }

          </button>



          {
            status==="error" &&

            <p
              style={{
                color:"#A85D50",
                marginTop:"15px"
              }}
            >
              Flight could not be verified. Check airline, flight number and date.
            </p>

          }



          {
            flight &&

            <div
              style={{
                marginTop:"25px",
                padding:"20px",
                background:"#17171A",
                border:"1px solid #232326"
              }}
            >

              <h3>
                Verified Flight
              </h3>


              <p>
                {flight.departureAirport}
                {" → "}
                {flight.arrivalAirport}
              </p>


              <p>
                Distance: {flight.distanceKm} km
              </p>


              <p>
                Status: {flight.status}
              </p>


              <p>
                Delay: {flight.delayHours} hours
              </p>


            </div>

          }



          <button
            type="submit"
            disabled={!flight}
            style={{
              ...buttonStyle,
              marginTop:"20px",
              opacity: flight ? 1 : .5
            }}
          >

            Check Eligibility

          </button>


        </form>        {
          result &&

          <section
            style={{
              marginTop:"35px",
              padding:"25px",
              background:"#17171A",
              border:"1px solid #232326"
            }}
          >

            <h2
              style={{
                color:
                  result.eligible
                  ? "#6B8F71"
                  : "#A85D50"
              }}
            >

              {
                result.eligible
                ?
                "You may be eligible for compensation"
                :
                "Not eligible"
              }

            </h2>


            {
              result.eligible &&

              <p
                style={{
                  fontSize:"42px",
                  fontWeight:"700"
                }}
              >
                €{result.amount}
              </p>

            }


            {
              !result.eligible &&

              <p
                style={{
                  color:"#B8B5AC"
                }}
              >
                The flight disruption does not meet the compensation threshold.
              </p>

            }


            {
              result.eligible &&

              <p
                style={{
                  color:"#B8B5AC"
                }}
              >
                Based on the verified flight distance and disruption information.
              </p>

            }


          </section>

        }


      </div>

    </main>
  );

}



const inputStyle = {

  width:"100%",
  padding:"14px",
  marginBottom:"15px",
  background:"#17171A",
  border:"none",
  borderBottom:"1px solid #38383C",
  color:"#EDEAE3",
  fontSize:"15px"

};



const buttonStyle = {

  width:"100%",
  padding:"15px",
  background:"#B08D3E",
  color:"#0F0F10",
  border:"none",
  cursor:"pointer",
  fontWeight:"700",
  fontSize:"15px"

};
