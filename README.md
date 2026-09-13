# ChatForum Web

Vue frontend for ChatForum, published with GitHub Pages. The backend runs separately.

This repository contains no model credentials, database, chat history, uploaded files or novel source.

Set the repository Actions variable `PUBLIC_API_BASE_URL` to the public HTTPS backend URL ending in `/api`, enable Pages with GitHub Actions and run `Publish frontend to GitHub Pages`.

The backend must allow the Pages origin in CORS and support Server-Sent Events.
Model API keys belong only on the backend. Never put keys in VITE variables or repository variables.
