# Khansa Enterprises - GST Invoicing App

A mobile-first GST Invoicing web application and Progressive Web App (PWA) built for **Khansa Enterprises** (Melvisharam, Ranipet District, Tamil Nadu).

---

## 1. Development & Local Testing

### Prerequisites
- Node.js (v20+ or v22+)
- Project configured with `.env.local`:
  ```ini
  VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
  ```

### Run Locally (Laptop)
```bash
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 2. Opening on Android Phone over the Same Wi-Fi

To test and install the PWA on an Android phone (Chrome):

1. **Connect both devices** (laptop and Android phone) to the same Wi-Fi network (or laptop connected to phone hotspot).
2. **Start Vite with the host flag**:
   ```bash
   npm run dev -- --host
   ```
   Or:
   ```bash
   npx vite --host
   ```
3. Look at the terminal output under **Network**. You will see a URL like:
   ```text
   ➜  Local:   http://localhost:5173/
   ➜  Network: http://192.168.1.XX:5173/
   ```
4. **Open the Network URL** (e.g. `http://192.168.1.XX:5173/`) in **Chrome on your Android phone**.
5. **Install PWA**:
   - Tap the three dots (`⋮`) in Chrome &rarr; **Add to Home screen** (or tap the "Install App" banner).
   - The app will launch standalone without browser address bars, with persistent login.

---

## 3. How to Deploy (Cloudflare Pages)

The app is built with Vite and pure client-side routing, making it zero-cost and ideal for **Cloudflare Pages** (avoiding Vercel Hobby commercial limitations):

1. **Push your code** to your GitHub repository `invoice-app`.
2. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) &rarr; **Workers & Pages** &rarr; **Create application** &rarr; **Pages** &rarr; **Connect to Git**.
3. Select your `invoice-app` repository and configure the build settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. In **Environment variables (production)**, add:
   - `VITE_SUPABASE_URL`: Your Supabase project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: Your Supabase publishable/anon key
5. Tap **Save and Deploy**.
6. Under **Pages** &rarr; **Custom Domains**, connect your free or custom domain (e.g. `invoice.khansa.example` or Cloudflare `.pages.dev` subdomain).

---

## 4. Testing

- **Unit Tests (Tax calculations & Bill utilities)**:
  ```bash
  npm test
  ```
- **Supabase Database & API Verification (13 tests in FY '99-00')**:
  ```bash
  npm run db-check
  ```
- **Production Build Verification**:
  ```bash
  npm run build
  ```
