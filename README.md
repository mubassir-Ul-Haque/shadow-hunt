# Shadow Hunt - Multiplayer 2D Survival Maze

Shadow Hunt is a real-time browser-based multiplayer survival maze game built with Node.js, WebSockets, HTML5 Canvas 2D/WebGL, and Web Audio API.

---

## 🌐 How to Publish & Host Online (Free Options)

Because **Shadow Hunt** is built as a lightweight, zero-dependency Node.js server (`server.js`) that handles both HTTP frontend files and WebSocket real-time game traffic, it can be published online in under 3 minutes for free!

---

### Option 1: Render.com (Recommended - 100% Free)

1. Push your code to a **GitHub repository**.
2. Go to [https://render.com](https://render.com) and sign up for a free account.
3. Click **New +** ➔ **Web Service**.
4. Connect your GitHub repository.
5. Set the following settings:
   - **Name**: `shadow-hunt`
   - **Environment**: `Node`
   - **Build Command**: `npm install` (or leave empty)
   - **Start Command**: `node server.js`
   - **Plan**: `Free`
6. Click **Create Web Service**.
7. Render will provide a public URL like `https://shadow-hunt.onrender.com`. Share this link with your friends to play live online!

---

### Option 2: Railway.app (Fastest Deployment)

1. Sign in to [https://railway.app](https://railway.app) with GitHub.
2. Click **New Project** ➔ **Deploy from GitHub repo**.
3. Select your `shadow-hunt` repository.
4. Railway will automatically detect Node.js and deploy the server.
5. In your project settings, click **Generate Domain** to get your public `https://...up.railway.app` URL.

---

### Option 3: Glitch.com (Instant No-Git Hosting)

1. Go to [https://glitch.com](https://glitch.com) and click **New Project** ➔ **Import from GitHub** (or upload project files directly).
2. Glitch automatically runs `node server.js`.
3. Click **Share** to get your live public URL instantly!

---

## 🕹️ Local Development

```bash
# Start local server
node server.js
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
