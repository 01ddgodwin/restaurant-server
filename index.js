const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Define your API endpoint to fetch restaurants from Yelp
// app.get('/api/restaurants', async (req, res) => {
//   try {
//     const { latitude, longitude, radius, open_now, price, categories } = req.query;
//     const apiKey = process.env.YELP_API_KEY; // Replace with your Yelp API key

//     // Make a request to Yelp API
//     const response = await axios.get('https://api.yelp.com/v3/businesses/search', {
//       params: {
//         latitude,
//         longitude,
//         term: 'restaurants', // Adjust query parameters as needed
//         limit: 50,
//         radius: radius * 1609,
//         open_now,
//         price,
//         categories
//       },
//       headers: {
//         Authorization: `Bearer ${apiKey}`,
//       },
//     });

//     res.json(response.data.businesses);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

app.get("/api/google-restaurants", async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      radiusInMiles, // Expecting miles from client
      openNow, // Expecting 'true' or 'false' string from client query params
      priceLevels, // Expecting string like "1,3" (for minPrice, maxPrice) or "2" (for minPrice=2, maxPrice=2)
      cuisineKeywords, // Expecting string like "italian,pizza"
    } = req.query;

    const googleApiKey = process.env.Maps_API_KEY;
    const radiusInMeters = parseFloat(radiusInMiles) * 1609.34;

    let googleParams = {
      location: `<span class="math-inline">\{latitude\},</span>{longitude}`,
      radius: radiusInMeters.toString(),
      type: "restaurant",
      key: googleApiKey,
      keyword: "restaurant", // Base keyword
    };

    if (openNow === "true") {
      googleParams.opennow = "true";
    }

    // Handle priceLevels from client (e.g., "1,3" -> minprice=1, maxprice=3)
    // Google uses 0-4. Client needs to send values in this range.
    if (priceLevels) {
      const prices = priceLevels
        .split(",")
        .map((p) => parseInt(p.trim(), 10))
        .filter((p) => !isNaN(p) && p >= 0 && p <= 4);
      if (prices.length > 0) {
        googleParams.minprice = Math.min(...prices).toString();
        googleParams.maxprice = Math.max(...prices).toString();
      }
    }

    if (cuisineKeywords) {
      googleParams.keyword += ` ${cuisineKeywords.replace(/,/g, " ")}`; // Add cuisines to keyword search
    }

    console.log("Requesting Google Places API with params:", googleParams);

    const googleResponse = await axios.get(
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
      {
        params: googleParams,
      }
    );

    if (
      googleResponse.data.status === "OK" ||
      googleResponse.data.status === "ZERO_RESULTS"
    ) {
      // Optionally, you could fetch Place Details for each result here to enrich the data
      // before sending it to the client. For now, we'll send Nearby Search results.

      // Map Google Places results to your desired `Items` structure
      const mappedResults = (googleResponse.data.results || []).map((place) => {
        let imageUrl = null; // Default/placeholder for your client to handle
        if (place.photos && place.photos.length > 0) {
          // Client will construct this URL to avoid making another API call from server for just one photo
          // Or server can construct it if preferred. For now, sending reference.
          // imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=<span class="math-inline">\{place\.photos\[0\]\.photo\_reference\}&key\=</span>{googleApiKey}`;
        }

        let priceString = "";
        if (place.price_level !== undefined && place.price_level > 0) {
          // price_level 0 is "Free"
          priceString = "$".repeat(place.price_level);
        }

        // Helper to calculate distance if not using rankby=distance
        // (User's client-side service already has this, so maybe client calculates it)
        // For simplicity here, we'll let the client calculate distance if needed.
        // The client has user's original lat/lng.

        return {
          id: place.place_id,
          name: place.name,
          image_url_reference:
            place.photos && place.photos[0]
              ? place.photos[0].photo_reference
              : null, // Send reference
          // Client will build full photo URL: `<span class="math-inline">\{this\.placePhotoUrl\}?maxwidth\=400&photoreference\=</span>{ref}&key=${this.googleApiKey}`
          is_open_now: place.opening_hours
            ? place.opening_hours.open_now
            : undefined,
          rating: place.rating || 0,
          review_count: place.user_ratings_total || 0,
          price_level: place.price_level, // Send the raw level
          price: priceString, // Send the derived string
          categories: place.types
            ? place.types
                .filter(
                  (type) =>
                    !["point_of_interest", "establishment", "food"].includes(
                      type
                    )
                )
                .map((type) => ({
                  alias: type,
                  title: type
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (l) => l.toUpperCase()),
                }))
            : [{ alias: "restaurant", title: "Restaurant" }],
          coordinates: {
            latitude: place.geometry.location.lat,
            longitude: place.geometry.location.lng,
          },
          location: {
            address1: place.vicinity, // Use vicinity from Nearby Search
            // city, state, zip, country, formatted_address, display_address would ideally come from Place Details call
            city: null,
            state: null,
            zip_code: null,
            country: null,
            formatted_address: place.vicinity, // Best guess from Nearby Search
            display_address: place.vicinity ? [place.vicinity] : [],
          },
          // These would require a Place Details call for each place_id
          phone: null,
          display_phone: null,
          website: null,
          url: `https://www.google.com/maps/search/?api=1&query=<span class="math-inline">\{encodeURIComponent\(place\.name\)\}&query\_place\_id\=</span>{place.place_id}`, // Google Maps link
        };
      });
      res.json(mappedResults);
    } else {
      console.error(
        "Google Places API Error on Server:",
        googleResponse.data.status,
        googleResponse.data.error_message
      );
      res.status(500).json({
        message: "Error fetching data from Google Places API",
        error: googleResponse.data.error_message || googleResponse.data.status,
      });
    }
  } catch (error) {
    // @ts-ignore
    console.error(
      "Server-side API Error:",
      error.response ? error.response.data : error.message
    );
    // @ts-ignore
    res.status(error.response ? error.response.status : 500).json({
      message: "Internal server error when calling Google API",
      // @ts-ignore
      error: error.response ? error.response.data : error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
