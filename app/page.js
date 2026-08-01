"use client";

import React, { useState, useEffect } from "react";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Inter:wght@400;500;600;700&display=swap');
`;


const REASONS = [
  { value: "technical", label: "Technical or mechanical fault" },
  { value: "crew", label: "Crew or scheduling issue" },
  { value: "weather", label: "Severe weather" },
  { value: "atc", label: "Air traffic control restriction" },
  { value: "strike", label: "Strike (airline staff)" },
  { value: "other", label: "Other or not sure" },
];


// ----------------------------------------------------
// REAL FLIGHT VERIFICATION
// NO MOCK DATA
// NO FALLBACK
// NO RANDOM DISTANCE
// ----------------------------------------------------

async function lookupFlightStatus(
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
        found:false,
        verified:false,
        error:
          data.error ||
          "Flight verification failed"
      };

    }



    // HARD SECURITY CHECK
    // Backend MUST confirm the flight

    if (
      !data.found ||
      data.verified !== true
    ) {

      return {
        found:false,
        verified:false,
        error:
          "Flight could not be verified"
      };

    }



    return {

      found:true,

      verified:true,

      status:
        data.status,

      delayHours:
        data.delayHours || 0,

      distanceKm:
        data.distanceKm,

      departureAirport:
        data.departureAirport,

      arrivalAirport:
        data.arrivalAirport,

      compensation:
        data.compensation,

      source:
        data.source

    };


  } catch(error){

    console.error(
      "Verification error:",
      error
    );


    return {

      found:false,

      verified:false,

      error:
        "Unable to verify flight"

    };

  }

}




export default function FlightClaimChecker() {


const [step,setStep] =
  useState("form");


const [form,setForm] =
useState({

  passenger:"",
  airline:"",
  flightNumber:"",
  date:"",
  delayType:"delayed",
  hours:"3",
  noticeGiven:"under14",
  reason:"technical"

});



const [result,setResult] =
useState(null);


const [letter,setLetter] =
useState("");


const [copied,setCopied] =
useState(false);



const [lookupState,setLookupState] =
useState("idle");


const [verifiedRoute,setVerifiedRoute] =
useState(null);



const [verificationData,setVerificationData] =
useState(null);





const km =
verifiedRoute?.km || null;




const canSubmit =

form.passenger.trim() &&

form.airline.trim() &&

form.flightNumber.trim() &&

form.date &&

lookupState === "done" &&

verifiedRoute?.km;





function updateForm(patch){

const changingFlight =

"airline" in patch ||

"flightNumber" in patch ||

"date" in patch;



setForm((current)=>({

...current,

...patch

}));



if(changingFlight){

setLookupState("idle");

setVerifiedRoute(null);

setVerificationData(null);

}

}





async function handleVerify(){

if(
!form.airline ||
!form.flightNumber ||
!form.date
){

return;

}



setLookupState("loading");



const info =
await lookupFlightStatus(

form.airline,

form.flightNumber,

form.date

);



if(
!info.found ||
!info.verified
){

setLookupState("error");

setVerifiedRoute(null);

return;

}




setVerificationData(info);



setForm((current)=>({

...current,

delayType:
info.status === "cancelled"
?
"cancelled"
:
"delayed",

hours:
String(info.delayHours)

}));




setVerifiedRoute({

km:
info.distanceKm,

from:
info.departureAirport,

to:
info.arrivalAirport

});



setLookupState("done");


}




function handleCheck(e){

e.preventDefault();


if(!canSubmit){

return;

}


// IMPORTANT:
// This now uses backend result only

setResult(
verificationData?.compensation
);


setStep("result");


}<Field label="Airline">
  <input
    className="w-full py-2 text-[15px] bg-transparent"
    style={underlineInput}
    value={form.airline}
    onChange={(e)=>
      updateForm({
        airline:e.target.value.toUpperCase()
      })
    }
    placeholder="WB"
  />
</Field>


<div className="grid grid-cols-2 gap-6">

  <Field label="Flight no.">

    <input

      className="w-full py-2 text-[15px] bg-transparent"

      style={underlineInput}

      value={form.flightNumber}

      onChange={(e)=>
        updateForm({
          flightNumber:e.target.value
        })
      }

      placeholder="101"

    />

  </Field>



  <Field label="Travel date">

    <input

      type="date"

      className="w-full py-2 text-[15px] bg-transparent"

      style={underlineInput}

      value={form.date}

      onChange={(e)=>
        updateForm({
          date:e.target.value
        })
      }

    />

  </Field>

</div>





<button

type="button"

onClick={handleVerify}

disabled={
lookupState==="loading" ||
!form.airline ||
!form.flightNumber ||
!form.date
}

className="w-full mb-3 py-3 text-[13px] font-semibold"

style={{

border:
lookupState==="done"
?
"1px solid #6B8F71"
:
"1px solid #38383C",

color:
lookupState==="done"
?
"#6B8F71"
:
"#B08D3E"

}}

>

{

lookupState==="loading"

?

"Checking verified flight..."

:

lookupState==="done"

?

"Flight verified"

:

"Verify flight"

}

</button>





{lookupState==="error" && (

<p

className="text-xs mb-6"

style={{
color:"#A85D50"
}}

>

Flight could not be verified. Check airline, flight number and date.

</p>

)}





{verifiedRoute && (

<Field

label="Verified route"

hint="Distance calculated from real airport coordinates."

>

<div

className="w-full py-2 flex justify-between"

style={{

borderBottom:
"1px solid #38383C",

color:"#EDEAE3"

}}

>

<span>

{verifiedRoute.from}

{" → "}

{verifiedRoute.to}

</span>


<span

style={{
color:"#6B8F71"
}}

>

{verifiedRoute.km?.toLocaleString()} km

</span>


</div>


</Field>

)}{step === "result" && result && (

<div>


<p
className="text-center text-xs mb-8"
style={{
color:"#8A877E"
}}
>
{form.airline} · {form.flightNumber}
</p>



<Reveal>

<h2

className="text-center"

style={{

fontFamily:"'Fraunces', serif",

fontSize:"1.8rem",

color:
result.eligible
?
"#6B8F71"
:
"#A85D50"

}}

>

{
result.eligible

?

"You're owed compensation"

:

"Not eligible this time"

}

</h2>

</Reveal>





{
result.eligible && (

<Reveal delay={200}>

<p

className="text-center mt-5"

style={{

fontFamily:"'Fraunces', serif",

fontSize:"3rem",

fontWeight:600

}}

>

€{result.amount}

</p>


</Reveal>

)

}





<Reveal delay={350}>

<p

className="text-center mt-6 text-[15px]"

style={{
color:"#B8B5AC"
}}

>

{result.reason}

</p>


</Reveal>





<Perforation />





<div className="flex flex-col gap-3">


{
result.eligible && (

<button

onClick={draftLetter}

className="w-full py-3.5 text-[14px] font-semibold"

style={{

background:"#B08D3E",

color:"#0F0F10"

}}

>

Draft claim letter

</button>

)

}




<button

onClick={()=>{

setStep("form");

setResult(null);

setLetter("");

setLookupState("idle");

setVerifiedRoute(null);

setVerificationData(null);


}}

className="w-full py-3.5 text-[14px]"

style={{

border:"1px solid #38383C",

color:"#B8B5AC"

}}

>

Check another flight

</button>


</div>


</div>

)}
