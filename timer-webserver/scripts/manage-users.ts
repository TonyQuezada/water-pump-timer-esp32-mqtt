import bcrypt from "bcryptjs";
import { userQueries } from "../lib/db";

// ========== HELPERS ==========
function printUsage() {
  console.log(`
Usage:
  npm run manage-users add username password
  npm run manage-users add username password --admin
  npm run manage-users delete username
  npm run manage-users list
  `);
}

function printTable(rows: object[]) {
  if (rows.length === 0) {
    console.log("No users found.");
    return;
  }
  console.table(rows);
}

// ========== COMMANDS ==========
function addUser(username: string, password: string, isAdmin: boolean) {
  if (!username || !password) {
    console.error("Error: username and password are required.");
    process.exit(1);
  }

  // Check if user already exists
  const existing = userQueries.findByUsername.get(username);
  if (existing) {
    console.error(`Error: user "${username}" already exists.`);
    process.exit(1);
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const role         = isAdmin ? "admin" : "user";

  userQueries.create.run(username, passwordHash, role);
  console.log(`✓ User "${username}" created with role "${role}".`);
}

function deleteUser(username: string) {
  if (!username) {
    console.error("Error: username is required.");
    process.exit(1);
  }

  const existing = userQueries.findByUsername.get(username);
  if (!existing) {
    console.error(`Error: user "${username}" not found.`);
    process.exit(1);
  }

  userQueries.delete.run(username);
  console.log(`✓ User "${username}" deleted.`);
}

function listUsers() {
  const users = userQueries.list.all();
  printTable(
    users.map((u) => ({
      id:         u.id,
      username:   u.username,
      role:       u.role,
      created_at: u.created_at,
    }))
  );
}

// ========== MAIN ==========
const args    = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "add": {
    const username = args[1];
    const password = args[2];
    const isAdmin  = args.includes("--admin");
    addUser(username, password, isAdmin);
    break;
  }
  case "delete": {
    const username = args[1];
    deleteUser(username);
    break;
  }
  case "list": {
    listUsers();
    break;
  }
  default: {
    printUsage();
    process.exit(1);
  }
}
