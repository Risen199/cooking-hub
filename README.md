Beiju (beiju.co.za)
A Live WhatsApp Commerce & Ordering Platform.

Beiju is a lightweight, scalable ordering system designed to bypass expensive app stores and meet users where they are: on WhatsApp. Built to empower local businesses by providing a zero-friction checkout experience.

🔗 View the Live App Here

🧠 The Architecture (How it works)
Frontend: Custom HTML/JS interfaces for store views and order confirmations (store-view.html, hub.html).

Backend: Serverless API routing (/api) for handling order logic and database connections.

Database: Supabase (SQL) for real-time data management.

Deployment: Configured for seamless CI/CD via Vercel (vercel.json).

Integration: Direct connection to WhatsApp APIs to push orders straight to the vendor's phone.

The Problem it Solves:
Many small local businesses lose money because customers don't want to download a clunky app or create an account just to buy food. Beiju solves this by allowing customers to browse a digital storefront and push the order straight to the business owner's WhatsApp, creating a zero-friction checkout experience for the buyer and an easy-to-manage dashboard for the seller.

My Role & Tech Stack
Role: Systems Architect & Integrator. I designed the database schema, structured the API flow, and integrated the frontend with the WhatsApp API and Supabase.

Languages: JavaScript, HTML, CSS.

Tools: Supabase, Vercel, Node.js.

How to Run Locally (For Developers)
(Note: This project requires Node.js and a Supabase account).

Clone the repo: git clone https://github.com/Risen199/cooking-hub.git

Install dependencies: npm install

Add your .env variables (Supabase keys and WhatsApp API keys).

Run the server: npm start (or your specific start command).

