# CrimeZone

## Start the application

The application requires Node.js 22.5 or later. No package installation is needed.

In PowerShell, set a private administrator password before starting the server:

```powershell
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_PASSWORD = "<your-unique-password-at-least-16-characters>"
npm start
```

Open the public CrimeZone homepage at `http://localhost:3000`. It introduces the project and links to the crime map dashboard at `http://localhost:3000/crime-map.html`, Safe Route, Emergency SOS, and incident reporting. The separate administrator portal is at `http://localhost:3000/admin`; sign in with the username and password configured in the server environment.

The server stores reports in `data/crimezone.sqlite` and private photo uploads in `data/report-photos/`. This local data directory is excluded from Git. Administrator sessions are held server-side, expire automatically, and are cleared when the server restarts.

Every served page includes a draggable CrimeZone Safety Guide chat button. The chat offers general, locally handled guidance for common safety questions; it does not use an AI service, store or send chat messages, access live crime records, provide legal advice, or contact emergency services. In India, call 112 for immediate danger.

## Deployment and report data

The admin overview and report APIs are protected by server-side session checks. Do not deploy the site through a static file server if you need protected admin data. In production, use HTTPS, set `NODE_ENV=production` so session cookies are marked `Secure`, and keep `ADMIN_PASSWORD` in the hosting provider's secret/environment configuration rather than in source control.

The server binds to `127.0.0.1` by default for local development. Set `HOST=0.0.0.0` only when your deployment platform requires an externally reachable container port; put it behind HTTPS and a trusted reverse proxy.

The overview distinguishes community-submitted reports from official crime data. A submitted report starts in the **Pending review** workflow state; this is not evidence that a crime occurred. The current admin server has no official crime-data feed configured.

The SQLite module is provided by Node.js and may display an experimental-feature warning on startup in current Node releases.
