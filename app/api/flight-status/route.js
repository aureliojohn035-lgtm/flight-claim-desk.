// app/api/flight-status/route.js
//
// Flight verification + compensation eligibility API
//
// Server-side only.
// API keys never reach the browser.

const FLIGHTS_BASE =
  "https://api.aviationstack.com/v1/flights";

const AIRPORTS_BASE =
  "https://api.aviationstack.com/v1/airports";


export async function GET(request) {

  const { searchParams } =
    new URL(request.url);


  const airline =
    searchParams.get("airline");

  const flightNumber =
    searchParams.get("flight");

  const date =
    searchParams.get("date");



  if (!airline || !flightNumber || !date) {

    return Response.json(
      {
        error:
          "Missing airline, flight or date"
      },
      {
        status: 400
      }
    );

  }



  const airlineCode =
    airline.trim().toUpperCase();


  const number =
    flightNumber.trim();



  if (!/^[A-Z]{2,3}$/.test(airlineCode)) {

    return Response.json(
      {
        error:
          "Invalid airline code"
      },
      {
        status:400
      }
    );

  }



  if (!/^\d{1,4}$/.test(number)) {

    return Response.json(
      {
        error:
          "Invalid flight number"
      },
      {
        status:400
      }
    );

  }



  if (!isValidDate(date)) {

    return Response.json(
      {
        error:
          "Invalid date"
      },
      {
        status:400
      }
    );

  }



  const apiKey =
    process.env.AVIATIONSTACK_API_KEY;



  if (!apiKey) {

    return Response.json(
      {
        error:
          "Missing API key"
      },
      {
        status:500
      }
    );

  }



  const requestedFlight =
    `${airlineCode}${number}`;



  try {


    const url =
      new URL(FLIGHTS_BASE);



    url.searchParams.set(
      "access_key",
      apiKey
    );


    url.searchParams.set(
      "flight_iata",
      requestedFlight
    );


    url.searchParams.set(
      "flight_date",
      date
    );



    const response =
      await fetchTimeout(
        url.toString(),
        8000
      );



    if (!response.ok) {

      return Response.json(
        {
          error:
            "Flight provider failed"
        },
        {
          status:502
        }
      );

    }



    const data =
      await response.json();



    const flight =
      (data?.data || [])
      .find((item)=>{

        return (
          item?.flight?.iata === requestedFlight &&
          item?.flight_date === date
        );

      });



    if (!flight) {

      return Response.json({

        found:false,

        verified:false,

        message:
          "Flight not found"

      });

    }    // -----------------------------
    // Verify arrival delay
    // -----------------------------

    const status =
      calculateArrivalDelay(flight);



    const departureAirport =
      flight?.departure?.iata;


    const arrivalAirport =
      flight?.arrival?.iata;



    let distanceKm = null;



    if (
      departureAirport &&
      arrivalAirport
    ) {

      const [
        departureCoords,
        arrivalCoords
      ] =
      await Promise.all([

        getAirportCoords(
          departureAirport,
          apiKey
        ),

        getAirportCoords(
          arrivalAirport,
          apiKey
        )

      ]);



      if (
        departureCoords &&
        arrivalCoords
      ) {

        distanceKm =
          Math.round(
            calculateDistance(
              departureCoords,
              arrivalCoords
            )
          );

      }

    }



    // -----------------------------
    // Compensation decision
    // -----------------------------

    const compensation =
      calculateCompensation({

        status:
          status.type,

        delayHours:
          status.delayHours,

        distanceKm

      });



    return Response.json({

      found:true,

      verified:true,


      flightNumber:
        requestedFlight,


      airline:
        flight?.airline?.name || null,


      aircraft:
        flight?.aircraft?.registration || null,


      departureAirport,


      arrivalAirport,


      status:
        status.type,


      delayHours:
        status.delayHours,


      delaySource:
        status.source,



      distanceKm,



      compensation


    });



  } catch(error) {


    console.error(
      "Flight lookup error:",
      error
    );


    return Response.json(

      {
        error:
          "Lookup failed"
      },

      {
        status:500
      }

    );


  }

}



// -----------------------------
// Fetch timeout protection
// -----------------------------

async function fetchTimeout(
  url,
  timeout
){

  const controller =
    new AbortController();



  const timer =
    setTimeout(
      ()=>controller.abort(),
      timeout
    );



  try {

    return await fetch(
      url,
      {
        signal:
          controller.signal,

        next:{
          revalidate:60
        }

      }
    );


  } finally {

    clearTimeout(timer);

  }

}



// -----------------------------
// Arrival delay calculation
// -----------------------------

function calculateArrivalDelay(
  flight
){

  if (
    flight?.flight_status ===
    "cancelled"
  ){

    return {

      type:
        "cancelled",

      delayHours:
        0,

      source:
        "flight-cancelled"

    };

  }



  const scheduled =
    flight?.arrival?.scheduled;



  const actual =
    flight?.arrival?.actual ||
    flight?.arrival?.estimated;



  if (
    !scheduled ||
    !actual
  ){

    return {

      type:
        "unknown",

      delayHours:
        0,

      source:
        "missing-arrival-data"

    };

  }



  const difference =
    new Date(actual) -
    new Date(scheduled);



  const hours =
    Math.max(
      0,
      difference /
      (1000 * 60 * 60)
    );



  if(hours >= 1){

    return {

      type:
        "delayed",

      delayHours:
        Math.round(hours * 10) / 10,

      source:
        "verified-arrival-delay"

    };

  }



  return {

    type:
      "on_time",

    delayHours:
      0,

    source:
      "verified-arrival-time"

  };

}// -----------------------------
// Airport coordinates lookup
// -----------------------------

async function getAirportCoords(
  iata,
  apiKey
){

  try {

    const url =
      new URL(AIRPORTS_BASE);



    url.searchParams.set(
      "access_key",
      apiKey
    );


    url.searchParams.set(
      "search",
      iata
    );



    const response =
      await fetchTimeout(
        url.toString(),
        8000
      );



    if(!response.ok){

      return null;

    }



    const data =
      await response.json();



    const airport =
      (data?.data || [])
      .find(
        a =>
          a.iata_code === iata ||
          a.iata === iata
      );



    if(!airport){

      return null;

    }



    const lat =
      Number(
        airport.latitude ??
        airport.lat
      );



    const lon =
      Number(
        airport.longitude ??
        airport.lon ??
        airport.lng
      );



    if(
      Number.isNaN(lat) ||
      Number.isNaN(lon)
    ){

      return null;

    }



    return {
      lat,
      lon
    };



  } catch(error){

    console.error(
      "Airport error:",
      error
    );

    return null;

  }

}



// -----------------------------
// Distance calculation
// -----------------------------

function calculateDistance(
  a,
  b
){

  const R = 6371;


  const rad =
    value =>
      value *
      Math.PI /
      180;



  const dLat =
    rad(
      b.lat - a.lat
    );


  const dLon =
    rad(
      b.lon - a.lon
    );



  const lat1 =
    rad(a.lat);


  const lat2 =
    rad(b.lat);



  const result =
    Math.sin(dLat / 2) ** 2 +

    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(dLon / 2) ** 2;



  return (
    2 *
    R *
    Math.asin(
      Math.sqrt(result)
    )
  );

}



// -----------------------------
// Compensation rules
// -----------------------------
//
// Example EU-style structure.
// Adjust depending on the laws
// your app supports.
//

function calculateCompensation({
  status,
  delayHours,
  distanceKm
}){


  if(status === "cancelled"){

    return {

      eligible:true,

      reason:
        "Flight cancelled",

      amount:
        "Depends on airline policy",

      currency:
        "EUR"

    };

  }



  if(
    status !== "delayed" ||
    !distanceKm
  ){

    return {

      eligible:false,

      reason:
        "Delay requirements not met",

      amount:0,

      currency:
        "EUR"

    };

  }



  if(
    delayHours < 3
  ){

    return {

      eligible:false,

      reason:
        "Arrival delay below compensation threshold",

      amount:0,

      currency:
        "EUR"

    };

  }



  let amount = 0;



  if(distanceKm <= 1500){

    amount = 250;

  }
  else if(distanceKm <= 3500){

    amount = 400;

  }
  else {

    amount = 600;

  }



  return {

    eligible:true,

    reason:
      "Verified arrival delay",

    amount,

    currency:
      "EUR"

  };

}



// -----------------------------
// Date validation
// -----------------------------

function isValidDate(
  value
){

  if(
    !/^\d{4}-\d{2}-\d{2}$/
    .test(value)
  ){

    return false;

  }



  const date =
    new Date(value);



  return (
    !Number.isNaN(
      date.getTime()
    )
  );

}

    
