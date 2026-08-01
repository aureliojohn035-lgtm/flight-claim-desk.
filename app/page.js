import { NextResponse } from "next/server";

const FLIGHTS_API =
  "http://api.aviationstack.com/v1/flights";

const AIRPORTS_API =
  "http://api.aviationstack.com/v1/airports";



export async function GET(request) {

  const { searchParams } =
    new URL(request.url);


  const airline =
    searchParams.get("airline")?.trim().toUpperCase();


  const flightNumber =
    searchParams.get("flight")?.trim();


  const date =
    searchParams.get("date");



  if (
    !airline ||
    !flightNumber ||
    !date
  ) {

    return NextResponse.json(
      {
        found:false,
        verified:false,
        error:
        "Missing airline, flight number or date"
      },
      {
        status:400
      }
    );

  }



  // Basic input protection

  if (
    !/^[A-Z]{2}$/.test(airline)
    ||
    !/^[0-9]{1,5}$/.test(flightNumber)
  ) {

    return NextResponse.json(
      {
        found:false,
        verified:false,
        error:
        "Invalid flight format"
      },
      {
        status:400
      }
    );

  }



  const apiKey =
    process.env.AVIATIONSTACK_API_KEY;



  if (!apiKey) {

    return NextResponse.json(
      {
        found:false,
        verified:false,
        error:
        "Missing API key"
      },
      {
        status:500
      }
    );

  }



  try {


    const flightUrl =
      new URL(FLIGHTS_API);


    flightUrl.searchParams.set(
      "access_key",
      apiKey
    );


    flightUrl.searchParams.set(
      "flight_iata",
      `${airline}${flightNumber}`
    );


    flightUrl.searchParams.set(
      "flight_date",
      date
    );



    const response =
      await fetch(
        flightUrl.toString(),
        {
          cache:"no-store"
        }
      );



    const data =
      await response.json();



    // DEBUG LOG
    // Check this in Vercel logs

    console.log(
      "AVIATIONSTACK RESPONSE:",
      JSON.stringify(
        data,
        null,
        2
      )
    );



    if (!response.ok) {

      return NextResponse.json(
        {
          found:false,
          verified:false,
          error:
          "Flight provider error"
        },
        {
          status:502
        }
      );

    }



    const flight =
      data?.data?.find(
        item =>
        item?.flight?.iata
        ===
        `${airline}${flightNumber}`
      );



    if (!flight) {

      return NextResponse.json(
        {
          found:false,
          verified:false,
          error:
          "Flight not found"
        }
      );

    }    const departure =
      flight?.departure?.iata;


    const arrival =
      flight?.arrival?.iata;



    if (
      !departure ||
      !arrival
    ) {

      return NextResponse.json(
        {
          found:false,
          verified:false,
          error:
          "Flight found but route data missing"
        }
      );

    }



    const departureCoords =
      await getAirportCoordinates(
        departure,
        apiKey
      );


    const arrivalCoords =
      await getAirportCoordinates(
        arrival,
        apiKey
      );



    if (
      !departureCoords ||
      !arrivalCoords
    ) {

      return NextResponse.json(
        {
          found:false,
          verified:false,
          error:
          "Unable to verify airport route"
        }
      );

    }



    const distanceKm =
      Math.round(
        calculateDistance(
          departureCoords,
          arrivalCoords
        )
      );



    const status =
      flight.flight_status;



    const delayHours =
      calculateDelay(
        flight
      );



    let normalizedStatus =
      "on_time";


    if (
      status === "cancelled"
    ) {

      normalizedStatus =
      "cancelled";

    }


    else if (
      delayHours >= 1
    ) {

      normalizedStatus =
      "delayed";

    }



    return NextResponse.json(

      {

        found:true,

        verified:true,


        status:
        normalizedStatus,


        delayHours,


        departureAirport:
        departure,


        arrivalAirport:
        arrival,


        distanceKm,


        // IMPORTANT:
        // compensation is NOT generated here.
        // Your eligibility calculator handles it.

        compensation:null,


        source:
        "aviationstack"

      }

    );



  } catch(error) {


    console.error(
      "FLIGHT VERIFY ERROR:",
      error
    );


    return NextResponse.json(
      {
        found:false,
        verified:false,
        error:
        "Verification failed"
      },
      {
        status:500
      }
    );


  }

}






async function getAirportCoordinates(
  iata,
  apiKey
) {

  try {


    const url =
      new URL(
        AIRPORTS_API
      );


    url.searchParams.set(
      "access_key",
      apiKey
    );


    url.searchParams.set(
      "search",
      iata
    );



    const response =
      await fetch(
        url.toString(),
        {
          cache:"force-cache"
        }
      );



    const data =
      await response.json();



    const airport =
      data?.data?.find(
        a =>
        a.iata_code === iata
        ||
        a.iata === iata
      );



    if (!airport)
      return null;



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



    if (
      Number.isNaN(lat)
      ||
      Number.isNaN(lon)
    ) {

      return null;

    }



    return {
      lat,
      lon
    };


  } catch {

    return null;

  }

}function calculateDistance(
  a,
  b
) {

  const earthRadius = 6371;


  const toRadians =
    value =>
    value *
    Math.PI /
    180;



  const dLat =
    toRadians(
      b.lat - a.lat
    );


  const dLon =
    toRadians(
      b.lon - a.lon
    );


  const lat1 =
    toRadians(
      a.lat
    );


  const lat2 =
    toRadians(
      b.lat
    );



  const calculation =

    Math.sin(dLat / 2) *
    Math.sin(dLat / 2)

    +

    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);



  return (

    earthRadius *

    2 *

    Math.atan2(

      Math.sqrt(calculation),

      Math.sqrt(
        1 - calculation
      )

    )

  );

}





function calculateDelay(
  flight
) {


  const scheduled =
    flight?.departure?.scheduled;


  const actual =
    flight?.departure?.actual
    ||
    flight?.departure?.estimated;



  if (
    !scheduled ||
    !actual
  ) {

    return 0;

  }



  const difference =

    new Date(actual)
    -
    new Date(scheduled);



  const hours =

    difference /
    (1000 * 60 * 60);



  return Math.max(
    0,
    Math.round(
      hours * 10
    ) / 10
  );


}
