"use client";

import React, { useState, useEffect } from "react";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,0..144,400&family=Inter:wght@400;500;600;700&display=swap');
`;

const REASONS = [
  { value: "technical", label: "Technical or mechanical fault" },
  { value: "crew", label: "Crew or scheduling issue" },
  { value: "weather", label: "Severe weather" },
  { value: "atc", label: "Air traffic control restriction" },
  { value: "strike", label: "Strike (airline staff)" },
  { value: "other", label: "Other or not sure" },
];

async function lookupFlightStatus(
  airline,
  flightNumber,
  date
) {
  try {

    const res = await fetch(
      `/api/flight-status?airline=${encodeURIComponent(
        airline
      )}&flight=${encodeURIComponent(
        flightNumber
      )}&date=${encodeURIComponent(date)}`
    );


    const data = await res.json();


    if (!res.ok || !data.found || data.verified !== true) {
      return {
        found:false,
        verified:false
      };
    }


    return {

      found:true,

      verified:true,

      status:data.status,

      delayHours:data.delayHours || 0,

      distanceKm:data.distanceKm,

      departureAirport:data.departureAirport,

      arrivalAirport:data.arrivalAirport,

      compensation:data.compensation,

      source:data.source

    };


  } catch(error){

    return {
      found:false,
      verified:false
    };

  }
}


const underlineInput = {
  backgroundColor:"transparent",
  borderBottom:"1px solid #38383C",
  color:"#EDEAE3",
  fontFamily:"'Inter', sans-serif",
  fontWeight:500
};


function Field({label,children,hint}){

return (

<label className="block mb-7">

<span
className="block mb-2 text-[13px] font-medium"
style={{
color:"#B8B5AC"
}}
>

{label}

</span>

{children}

{hint && (

<span
className="block mt-1.5 text-xs"
style={{
color:"#8A877E"
}}
>

{hint}

</span>

)}

</label>

);

}



function Reveal({children,delay=0}){

const [visible,setVisible]=useState(false);


useEffect(()=>{

const t=setTimeout(
()=>setVisible(true),
delay
);

return ()=>clearTimeout(t);

},[delay]);



return (

<div
style={{
opacity:visible?1:0,
transform:visible
?"translateY(0)"
:"translateY(6px)",
transition:"opacity 700ms ease, transform 700ms ease"
}}
>

{children}

</div>

);

}


function Perforation(){

return (

<div
className="relative flex items-center my-8"
>

<div
className="flex-1 border-t"
style={{
borderTopStyle:"dashed",
borderColor:"#38383C"
}}
/>

</div>

);

}


export default function FlightClaimChecker(){

const [step,setStep]=useState("form");

const [form,setForm]=useState({

passenger:"",
airline:"",
flightNumber:"",
date:"",
delayType:"delayed",
hours:"3",
noticeGiven:"under14",
reason:"technical"

});


const [lookupState,setLookupState]=useState("idle");

const [verifiedRoute,setVerifiedRoute]=useState(null);

const [verificationData,setVerificationData]=useState(null);

const [result,setResult]=useState(null);

const [letter,setLetter]=useState("");

const [copied,setCopied]=useState(false);


const canSubmit =
form.passenger.trim() &&
form.airline.trim() &&
form.flightNumber.trim() &&
form.date &&
lookupState==="done" &&
verifiedRoute?.km;



function updateForm(patch){

const flightChanged =
"airline" in patch ||
"flightNumber" in patch ||
"date" in patch;


setForm(current=>({
...current,
...patch
}));


if(flightChanged){

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
)
return;


setLookupState("loading");


const info =
await lookupFlightStatus(
form.airline,
form.flightNumber,
form.date
);



if(!info.verified){

setLookupState("error");

return;

}


setVerificationData(info);


setVerifiedRoute({

km:info.distanceKm,

from:info.departureAirport,

to:info.arrivalAirport

});


setLookupState("done");

}


function handleCheck(e){

e.preventDefault();

if(!canSubmit)
return;


setResult(
verificationData?.compensation
);


setStep("result");

}function draftLetter(){

const text =
`Subject: Flight Compensation Claim

To ${form.airline} Customer Relations,

I am requesting compensation for flight ${form.airline} ${form.flightNumber} on ${form.date}.

The flight was verified through official flight data records.

Route:
${verifiedRoute?.from} → ${verifiedRoute?.to}

Distance:
${verifiedRoute?.km} km

Disruption:
${verificationData?.status}

Requested compensation:
€${result?.amount || 0}


Passenger:
${form.passenger}
`;

setLetter(text);

setStep("letter");

}



function copyLetter(){

navigator.clipboard?.writeText(letter);

setCopied(true);

setTimeout(
()=>setCopied(false),
2000
);

}



return (

<div
className="min-h-screen w-full flex justify-center px-6 py-16"
style={{
backgroundColor:"#0F0F10",
fontFamily:"'Inter', sans-serif"
}}
>

<style>
{`
${FONT_IMPORT}

input:focus,
select:focus{
outline:none;
border-bottom-color:#B08D3E;
}

::selection{
background:#B08D3E;
color:#0F0F10;
}

`}
</style>



<div className="w-full max-w-md">



<div className="mb-14 text-center">

<p
className="text-xs mb-3 uppercase font-medium"
style={{
color:"#B8B5AC",
letterSpacing:"0.18em"
}}
>

Compensation check

</p>


<h1

style={{

fontFamily:"'Fraunces', serif",

fontWeight:600,

color:"#EDEAE3",

fontSize:"2rem",

lineHeight:1.15

}}

>

Are you owed money

<br/>

for that flight?

</h1>


</div>





{step==="form" && (

<form onSubmit={handleCheck}>


<Field label="Your name">

<input

className="w-full py-2 text-[15px] bg-transparent"

style={underlineInput}

value={form.passenger}

onChange={(e)=>
updateForm({
passenger:e.target.value
})
}

placeholder="Jordan Reyes"

/>

</Field>




<div className="grid grid-cols-2 gap-6">


<Field label="Airline">


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


</div>





<Field label="Date of travel">

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

"Checking flight..."

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

Flight not found. Please check the details.

</p>

)}





{verifiedRoute && (

<Field

label="Verified route"

hint="Distance calculated from verified airports."

>


<div

className="w-full py-2 flex justify-between"

style={{

borderBottom:"1px solid #38383C",

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

)}<Field label="What happened">

<div className="flex gap-6">

<button
type="button"
disabled={lookupState==="done"}
onClick={()=>
setForm({
...form,
delayType:"delayed"
})
}

className="pb-1 text-[15px]"
style={{
color:
form.delayType==="delayed"
?
"#EDEAE3"
:
"#8A877E"
}}

>

Delayed

</button>


<button
type="button"
disabled={lookupState==="done"}
onClick={()=>
setForm({
...form,
delayType:"cancelled"
})
}

className="pb-1 text-[15px]"
style={{
color:
form.delayType==="cancelled"
?
"#EDEAE3"
:
"#8A877E"
}}

>

Cancelled

</button>


</div>

</Field>



<Field label="Stated cause, if known">

<select

className="w-full py-2 text-[15px] bg-transparent"

style={underlineInput}

value={form.reason}

onChange={(e)=>
setForm({
...form,
reason:e.target.value
})
}

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


</Field>



<button

type="submit"

disabled={!canSubmit}

className="w-full py-3.5 text-[14px] font-semibold"

style={{

backgroundColor:"#B08D3E",

color:"#0F0F10",

opacity:canSubmit?1:0.5

}}

>

Check eligibility

</button>



</form>

)}





{step==="result" && result && (

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

"Not eligible"

}

</h2>


</Reveal>




{result.eligible && (

<Reveal delay={200}>

<p

className="text-center mt-5"

style={{

fontFamily:"'Fraunces', serif",

fontSize:"3rem"

}}

>

€{result.amount}

</p>


</Reveal>

)}




<Reveal delay={300}>

<p

className="text-center mt-6"

style={{
color:"#B8B5AC"
}}

>

{result.reason}

</p>


</Reveal>




<Perforation />



{result.eligible && (

<button

onClick={draftLetter}

className="w-full py-3.5"

style={{

background:"#B08D3E",

color:"#0F0F10"

}}

>

Draft claim letter

</button>

)}



</div>

)}





{step==="letter" && (

<div>


<h2

className="text-center mb-8"

style={{

fontFamily:"'Fraunces', serif",

color:"#EDEAE3"

}}

>

Ready to send

</h2>


<pre

className="whitespace-pre-wrap p-6 text-sm"

style={{

background:"#17171A",

color:"#EDEAE3"

}}

>

{letter}

</pre>



<button

onClick={copyLetter}

className="w-full mt-5 py-3"

style={{

background:"#B08D3E",

color:"#0F0F10"

}}

>

{copied?"Copied":"Copy letter"}

</button>


</div>

)}





<p

className="text-center text-xs mt-14"

style={{
color:"#6B6963"
}}

>

Demo prototype · eligibility rules simplified for illustration

</p>



</div>

</div>

);

}
