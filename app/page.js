"use client";

import React, { useState } from "react";


const REASONS = [
  {
    value: "technical",
    label: "Technical or mechanical issue",
  },
  {
    value: "crew",
    label: "Crew or airline issue",
  },
  {
    value: "weather",
    label: "Weather",
  },
  {
    value: "atc",
    label: "Air traffic control",
  },
  {
    value: "other",
    label: "Other",
  },
];



// ------------------------------------------------
// REAL BACKEND FLIGHT VERIFICATION ONLY
// No mock data.
// No manual distance.
// No fake compensation.
// ------------------------------------------------

async function verifyFlight(
  airline,
  flightNumber,
  date
) {

  try {

    const response =
      await fetch(
        `/api/flight-status?airline=${encodeURIComponent(
          airline
        )}&flight=${encodeURIComponent(
          flightNumber
        )}&date=${encodeURIComponent(
          date
        )}`
      );


    const data =
      await response.json();



    if (!response.ok) {

      return {

        verified:false,

        error:
          data.error ||
          "Verification failed"

      };

    }



    if (
      !data.found ||
      !data.verified
    ) {

      return {

        verified:false,

        error:
          "Flight could not be verified"

      };

    }



    return {

      verified:true,

      flightNumber:
        data.flightNumber,

      status:
        data.status,

      delayHours:
        data.delayHours,

      distanceKm:
        data.distanceKm,

      departureAirport:
        data.departureAirport,

      arrivalAirport:
        data.arrivalAirport,

      compensation:
        data.compensation

    };



  } catch(error) {


    console.error(
      error
    );


    return {

      verified:false,

      error:
        "Server verification failed"

    };


  }

}




export default function FlightClaimChecker(){


  const [step,setStep] =
    useState("form");


  const [form,setForm] =
    useState({

      passenger:"",
      airline:"",
      flightNumber:"",
      date:"",
      reason:"technical"

    });



  const [verification,setVerification] =
    useState(null);



  const [loading,setLoading] =
    useState(false);



  const [error,setError] =
    useState("");



  const [result,setResult] =
    useState(null);



  const [letter,setLetter] =
    useState("");




  function updateForm(value){

    setForm({

      ...form,

      ...value

    });

  }




  async function handleVerify(){


    setLoading(true);

    setError("");



    const result =
      await verifyFlight(

        form.airline,

        form.flightNumber,

        form.date

      );



    setLoading(false);



    if(!result.verified){

      setVerification(null);

      setError(
        result.error
      );

      return;

    }



    setVerification(result);


  }



  function submitClaim(e){

    e.preventDefault();



    if(!verification){

      return;

    }



    setResult(

      verification.compensation

    );


    setStep("result");

  }  return (

    <div
      className="min-h-screen flex justify-center px-6 py-16"
      style={{
        background:"#0F0F10",
        color:"#EDEAE3"
      }}
    >

      <div className="w-full max-w-md">


        <h1
          className="text-center text-3xl mb-10"
          style={{
            fontFamily:"serif"
          }}
        >
          Flight Compensation Check
        </h1>



        {step === "form" && (

          <form
            onSubmit={submitClaim}
          >


            <input
              className="w-full mb-5 p-3 bg-transparent border-b"
              placeholder="Passenger name"
              value={form.passenger}
              onChange={(e)=>
                updateForm({
                  passenger:e.target.value
                })
              }
            />



            <input
              className="w-full mb-5 p-3 bg-transparent border-b"
              placeholder="Airline code (example: WB)"
              value={form.airline}
              onChange={(e)=>
                updateForm({
                  airline:e.target.value.toUpperCase()
                })
              }
            />



            <input
              className="w-full mb-5 p-3 bg-transparent border-b"
              placeholder="Flight number"
              value={form.flightNumber}
              onChange={(e)=>
                updateForm({
                  flightNumber:e.target.value
                })
              }
            />



            <input
              type="date"
              className="w-full mb-5 p-3 bg-transparent border-b"
              value={form.date}
              onChange={(e)=>
                updateForm({
                  date:e.target.value
                })
              }
            />



            <button
              type="button"
              onClick={handleVerify}
              disabled={loading}
              className="w-full py-3 mb-5"
              style={{
                background:"#B08D3E",
                color:"#0F0F10"
              }}
            >

              {
                loading
                ?
                "Verifying flight..."
                :
                "Verify real flight"
              }

            </button>



            {verification && (

              <div
                className="mb-6 p-4"
                style={{
                  border:
                  "1px solid #6B8F71"
                }}
              >

                <p>
                  Verified flight:
                  {" "}
                  {verification.flightNumber}
                </p>


                <p>
                  Route:
                  {" "}
                  {verification.departureAirport}
                  {" → "}
                  {verification.arrivalAirport}
                </p>


                <p>
                  Distance:
                  {" "}
                  {
                    verification.distanceKm
                    ?
                    `${verification.distanceKm} km`
                    :
                    "Unavailable"
                  }
                </p>


                <p>
                  Status:
                  {" "}
                  {verification.status}
                </p>

              </div>

            )}




            {error && (

              <p
                className="mb-5"
                style={{
                  color:"#A85D50"
                }}
              >
                {error}
              </p>

            )}



            <select

              className="w-full mb-6 p-3 bg-transparent border-b"

              value={form.reason}

              onChange={(e)=>
                updateForm({
                  reason:e.target.value
                })
              }

            >

              {
                REASONS.map((r)=>(

                  <option
                    key={r.value}
                    value={r.value}
                    style={{
                      background:"#17171A"
                    }}
                  >

                    {r.label}

                  </option>

                ))
              }

            </select>





            <button

              type="submit"

              disabled={!verification}

              className="w-full py-3"

              style={{

                background:
                  verification
                  ?
                  "#6B8F71"
                  :
                  "#333",

                color:"#0F0F10"

              }}

            >

              Check eligibility

            </button>



          </form>

        )}        {step === "result" && result && (

          <div>

            <h2
              className="text-center text-2xl mb-8"
              style={{
                fontFamily:"serif"
              }}
            >
              Eligibility Result
            </h2>



            <div
              className="p-6 mb-6"
              style={{
                border:
                "1px solid #38383C"
              }}
            >

              <p className="mb-3">

                Flight:
                {" "}
                {form.airline}
                {" "}
                {form.flightNumber}

              </p>


              <p className="mb-3">

                Status:
                {" "}
                {verification?.status}

              </p>


              <p className="mb-3">

                Distance:
                {" "}
                {verification?.distanceKm}
                km

              </p>



              {
                result?.eligible
                ?

                <>

                  <p
                    style={{
                      color:"#6B8F71",
                      fontSize:"22px"
                    }}
                  >
                    Eligible
                  </p>


                  <p
                    className="text-4xl mt-4"
                  >
                    €
                    {result.amount}

                  </p>

                </>


                :

                <p
                  style={{
                    color:"#A85D50"
                  }}
                >
                  Not eligible
                </p>

              }



              <p className="mt-5">

                {result.reason}

              </p>


            </div>




            {
              result?.eligible && (

                <button

                  className="w-full py-3 mb-4"

                  style={{
                    background:"#B08D3E",
                    color:"#0F0F10"
                  }}

                  onClick={()=>{


                    const claim =

`Subject: Flight Compensation Claim

Passenger:
${form.passenger}


Flight:
${form.airline} ${form.flightNumber}


Date:
${form.date}


I am requesting compensation for my disrupted flight.

Verified distance:
${verification.distanceKm} km


Claim amount:
€${result.amount}


Regards,

${form.passenger}
`;


                    setLetter(claim);

                  }}

                >

                  Generate Claim Letter

                </button>

              )

            }





            {
              letter && (

                <textarea

                  className="w-full p-4"

                  rows="12"

                  value={letter}

                  readOnly

                  style={{
                    background:"#17171A",
                    color:"#EDEAE3"
                  }}

                />

              )

            }



            <button

              className="w-full py-3 mt-5"

              style={{
                border:
                "1px solid #38383C"
              }}

              onClick={()=>{

                setStep("form");

                setVerification(null);

                setResult(null);

                setLetter("");

              }}

            >

              Check another flight

            </button>


          </div>

        )}


      </div>

    </div>

  );

}
