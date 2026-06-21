/**
 * icode Admin Setup Script
 * ─────────────────────────────────────────────
 * Interactive:    npm run setup:admin
 * Non-interactive: npm run setup:admin -- admin@example.com yourpassword
 *
 * Creates (or upgrades) an account to admin status directly in the database.
 * No server needs to be running.
 */

import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

// ── Helpers ──────────────────────────────────────────────────────────────────

const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan   = (s) => `\x1b[36m${s}\x1b[0m`;
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;

function banner() {
  console.log(cyan(bold(`
  ┌──────────────────────────────────┐
  │   icode — Admin Account Setup    │
  └──────────────────────────────────┘
`)));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  banner();

  if (!process.env.DATABASE_URL) {
    console.error(red("  ✗  DATABASE_URL not found. Make sure .env.local exists."));
    process.exit(1);
  }

  let email, password;
  const [,, argEmail, argPassword] = process.argv;

  if (argEmail && argPassword) {
    // Non-interactive mode: npm run setup:admin -- email pass
    email    = argEmail.trim().toLowerCase();
    password = argPassword;
    console.log(`  Using args: ${email}\n`);
  } else {
    // Interactive mode
    const rl = createInterface({ input, output });
    try {
      email    = (await rl.question("  Admin email:    ")).trim().toLowerCase();
      password = (await rl.question("  Admin password: ")).trim();
    } finally {
      rl.close();
    }
    console.log();
  }

  // Validate
  if (!email || !email.includes("@")) {
    console.error(red("  ✗  Enter a valid email address."));
    process.exit(1);
  }
  if (!password || password.length < 6) {
    console.error(red("  ✗  Password must be at least 6 characters."));
    process.exit(1);
  }

  console.log("  Hashing password…");
  const hash = await bcrypt.hash(password, 12);

  console.log("  Writing to database…\n");
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    INSERT INTO users (email, password_hash, is_admin)
    VALUES (${email}, ${hash}, TRUE)
    ON CONFLICT (email)
    DO UPDATE SET is_admin = TRUE, password_hash = ${hash}
    RETURNING id, email, is_admin
  `;

  const user = rows[0];

  console.log(green(bold("  ✓  Admin account ready!\n")));
  console.log(`  Email:   ${bold(user.email)}`);
  console.log(`  Admin:   ${green("yes")}\n`);
  console.log(cyan(`  ────────────────────────────────────────`));
  console.log(`  1. Start dev server →  ${bold("npm run dev")}`);
  console.log(`  2. Sign in at       →  ${bold("http://localhost:3000/auth/login")}`);
  console.log(`  3. Admin dashboard  →  ${bold("http://localhost:3000/admin/dashboard")}`);
  console.log(cyan(`  ────────────────────────────────────────\n`));
}

main().catch((err) => {
  console.error(red(`\n  ✗  Setup failed: ${err.message ?? err}\n`));
  process.exit(1);
});
