const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Define your API endpoint to fetch restaurants from Yelp
app.get('/api/restaurants', async (req, res) => {
  try {
    const { latitude, longitude, radius, open_now, price, categories } = req.query;
    const apiKey = process.env.YELP_API_KEY; // Replace with your Yelp API key

    // Make a request to Yelp API
    const response = await axios.get('https://api.yelp.com/v3/businesses/search', {
      params: {
        latitude,
        longitude,
        term: 'restaurants', // Adjust query parameters as needed
        limit: 50,
        radius: radius * 1609,
        open_now,
        price,
        categories
      },
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    res.json(response.data.businesses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
