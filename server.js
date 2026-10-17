const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const INBOX_DIR = path.join(__dirname, "data");
const INBOX_FILE = path.join(INBOX_DIR, "enquiries.jsonl");

app.disable("x-powered-by");
app.use(helmet({
  // This starter serves locally hosted assets and does not need inline scripts.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", "https:", "data:"],
      imgSrc: ["'self'", "https:", "data:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many enquiries from this connection. Please try again in 15 minutes."
  }
});

function cleanString(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\u0000/g, "").slice(0, maxLength);
}

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "Digitalsparkk backend",
    status: "running"
  });
});

app.post("/api/contact", contactLimiter, (req, res) => {
  const name = cleanString(req.body.name, 100);
  const email = cleanString(req.body.email, 254).toLowerCase();
  const phone = cleanString(req.body.phone, 40);
  const service = cleanString(req.body.service, 100);
  const message = cleanString(req.body.message, 5000);

  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      message: "Please provide your name, email address, and message."
    });
  }

  // Practical basic email check; production systems may use a dedicated validator.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email address."
    });
  }

  if (name.length < 2 || message.length < 10) {
    return res.status(400).json({
      success: false,
      message: "Name must be at least 2 characters and message at least 10 characters."
    });
  }

  const enquiry = {
    id: require("crypto").randomUUID(),
    createdAt: new Date().toISOString(),
    name,
    email,
    phone,
    service,
    message
  };

  try {
    fs.mkdirSync(INBOX_DIR, { recursive: true });
    fs.appendFileSync(INBOX_FILE, JSON.stringify(enquiry) + "\n", {
      encoding: "utf8",
      mode: 0o600
    });
  } catch (error) {
    console.error("Could not save contact enquiry:", error.message);
    return res.status(500).json({
      success: false,
      message: "We could not save your enquiry right now. Please try again later."
    });
  }

  console.log(`Contact enquiry received: ${enquiry.id}`);
  return res.status(201).json({
    success: true,
    message: "Thank you! Your enquiry has been received. We will get back to you soon."
  });
});

// Serve website files from public/
app.use(express.static(PUBLIC_DIR));

app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "API endpoint not found." });
});

app.use((req, res) => {
  res.status(404).send("Page not found.");
});

app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({
    success: false,
    message: "Unexpected server error. Please try again later."
  });
});

app.listen(PORT, () => {
  console.log(`Digitalsparkk backend running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
