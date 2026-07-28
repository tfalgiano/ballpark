/* Generates valid Ballpark Pro unlock codes (matches validCode() in app.js).
   Run: node tools/make-code.js [count]
   Wire these into your Stripe/Gumroad post-purchase email until you move to
   server-side licensing. */
"use strict";
const crypto = require("node:crypto");

function checksum(body) {
  let s = 0;
  for (let k = 0; k < body.length; k++) s = (s * 31 + body.charCodeAt(k)) % 9973;
  return s % 89;
}
function randomBody() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let b = "";
  for (let i = 0; i < 8; i++) b += chars[crypto.randomInt(chars.length)];
  return b;
}
function makeCode() {
  for (;;) {
    const b = randomBody();
    if (checksum(b) === 7) return `BP-${b.slice(0, 4)}-${b.slice(4)}`;
  }
}

const n = Math.max(1, parseInt(process.argv[2] || "10", 10));
for (let i = 0; i < n; i++) console.log(makeCode());
