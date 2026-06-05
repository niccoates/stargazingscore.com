# Stargazing Score

A lightweight static website for checking tonight's stargazing conditions for any UK postcode.

Stargazing Score converts a postcode into coordinates, fetches tonight's forecast, and presents a simple astronomy-focused score with a star rating, moon phase, and short outlook.

## Features

- UK postcode search
- Shareable forecast URLs, for example `/gl527zj`
- Direct forecast loading from path-based URLs
- Stargazing score from 0-100
- Custom star rating
- CSS-rendered moon phase
- Natural-language forecast commentary
- No backend, database, authentication, build step, or external dependencies

## Data Sources

- Postcode lookup: [Postcodes.io](https://postcodes.io/)
- Weather forecast: [Open-Meteo](https://open-meteo.com/)

All requests are made directly from the browser.

## Scoring

The score is calculated in `calculateStargazingScore(weatherData)` using:

- Cloud cover: 60%
- Visibility: 25%
- Humidity: 15%

## Project Structure

```txt
/
├── index.html
├── 404.html
├── _redirects
├── site.webmanifest
├── javascripts/
│   └── app.js
├── stylesheets/
│   └── styles.css
└── images/
    ├── favicon.svg
    ├── og-image.png
    └── og-image.svg
```

## Local Development

Use any static file server from the project root.

```sh
http-server
```

Then open:

```txt
http://localhost:8080/
```

Direct local routes such as `/gl527zj` are supported via `404.html` for static-server fallback.

## Deployment

Deploy the repository to a static host such as Cloudflare Pages.

Cloudflare Pages uses `_redirects` so path-based forecast URLs work on direct navigation:

```txt
/:postcode / 200
```

## Notes

- Browser geolocation is not used.
- Location permissions are never requested.
- The last successfully searched postcode is stored in `localStorage`.
- Forecasts are indicative only.
